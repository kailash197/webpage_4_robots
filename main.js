new Vue({
    el: '#app',
    data: {
        // ROS Connection
        rosbridge_connected: false,
        ros: null,
        rosbridge_address: 'wss://i-0506a9b1426a58708.robotigniteacademy.com/bf8543f7-8467-446c-ab46-469b8721aeab/rosbridge/',
        logs: [],
        loading: false,
        port: '9090',

        // publisher
        pubInterval: null,
       
        // Joystick Control
        dragging: false,
        joystick: {
            vertical: 0,
            horizontal: 0
        },
        joystickBaseRect: null,

        // wh_status
        wh_status: {
            fail_count: 0,
            current: 'start',
            start: 'inactive',
            localize: 'inactive',
            search_cart: 'inactive',
            attach_cart: 'inactive',
            goto_ship_pose: 'inactive',
            return_home: 'inactive',
            manual_ship_pose: 'inactive'
        },

        // ODOM subscriber data
        position: { x: 0, y: 0, z: 0, },
        yaw: 0,

        // Map Viewer
        mapViewer: null,
        mapGridClient: null,
        interval: null,
        scale: 0.14,
        shift: 0.0,
        goalPose: null,
        goalArrow: null,

        //Destination Waypoints
        wp1: {x: 0.00, y: 0.0, yaw: 0.0},
        wp2: {x: 0.00, y: 0.0, yaw: 0.0},
        wp3: {x: 0.00, y: 0.0, yaw: 0.0},
        wp4: {x: 0.00, y: 0.0, yaw: 0.0},
    },
    watch: {
        scale(val) {
            this.updateMapTransform();
        },
        shift(val) {
            this.updateMapTransform();
        }
    },

    methods: {
        connectROS: function () {
            console.log('Connecting to ROS...');
            this.loading = true
            this.ros = new ROSLIB.Ros({
                url: this.rosbridge_address
            })
            this.ros.on('connection', () => {
                this.logs.unshift((new Date()).toTimeString() + ' - Connected!')
                this.rosbridge_connected = true
                this.loading = false
                this.pubInterval = setInterval(this.publishFromJoystick, 100)
                console.log("ROS connected.")
                this.detectEnvironment()
                this.read_wh_status()
                this.setupMapViewer()
                this.setupCurrentPose()
                this.setupCurrentCartPose()
                this.setupStaticShipImage1()
                this.setupStaticShipImage2()
                this.setupStaticShipImage3()
                this.setupStaticShipImage4()
            })
            this.ros.on('error', (error) => {
                this.logs.unshift((new Date()).toTimeString() + ` - Error: ${error}`)
                this.loading = false;
                console.log("ROS connection error")
            })
            this.ros.on('close', () => {
                this.logs.unshift((new Date()).toTimeString() + ' - Disconnected!')
                this.rosbridge_connected = false
                this.loading = false
                console.log("ROS connection closed")
                clearInterval(this.pubInterval)
                this.unsetMapViewer()
                // ODOM subscriber data
                this.position = { x: 0, y: 0, z: 0, }
                this.yaw = 0
            })
        },
        disconnectROS: function () {
            console.log('Disconnecting from ROS...');
            if (this.ros) {
                this.ros.close();
            }
            this.goal = null;
            this.gl_state = null;
            this.rosbridge_connected=false;
        },

        // detect the environment: sim or real
        detectEnvironment() {
            console.log(`Detecting current environment`);
            this.ros.getTopics((topics) => {
                const topicList = topics.topics;

                if (topicList.includes('/diffbot_base_controller/cmd_vel_unstamped')) {
                    // Simulated environment
                    this.env = 'sim';
                    this.cmdtopic = '/diffbot_base_controller/cmd_vel_unstamped';
                    this.wp1 = {x: 1.0, y: +5.0, yaw: -0.00};
                    this.wp2 = {x: 28, y: 10, yaw: -1.57};
                    this.wp3 = {x: 20.0, y: -10.0, yaw: +1.57};
                    this.wp4 = {x: 5.2, y: -15.2, yaw: +0.72};
                } else {
                    // Real environment
                    this.env = 'real';
                    this.cmdtopic = '/cmd_vel';
                    this.wp1 = {x: -25.0, y: +2.0, yaw: -0.00};
                    this.wp2 = {x: -11.50, y: +3.0, yaw: -1.57};
                    this.wp3 = {x: 6.0, y: -20.2, yaw: +0.72};
                    this.wp4 = {x: -22.0, y: -22.0, yaw: +1.57};
                }
                console.log(`Environment: ${this.env}, CMD Topic: ${this.cmdtopic}, wp1: ${this.wp1}`);
            }, (err) => {
                console.error('Error detecting environment:', err);
                // Fallback to real
                this.env = 'real';
                this.cmdtopic = '/cmd_vel';
            });
        },
        
        moveRobot(direction) {
            console.log(`Moving robot: ${direction} `);
            const speed = 0.4; // Default speed value
            switch(direction) {
                case 'forward':
                    this.publish(speed, 0.0);
                    break;
                case 'backward':
                    this.publish(-speed, 0.0);
                    break;
                case 'left':
                    this.publish(0.0, speed);
                    break;
                case 'right':
                    this.publish(0.0, -speed);
                    break;
                default:
                    this.publish(0.0, 0.0); // Stop
            }
        },
        
        // Command velocity publisher for Joystick
        publish (linear_vel, angular_vel) {
            if (!this.ros || !this.ros.isConnected) {
                console.warn('ROS not connected, cannot publish');
                return;
            }
            let topic = new ROSLIB.Topic({
                ros: this.ros,
                name: this.cmdtopic,
                messageType: 'geometry_msgs/Twist'
            })
            let message = new ROSLIB.Message({
                linear: { x: linear_vel, y: 0, z: 0, },
                angular: { x: 0, y: 0, z: angular_vel, },
            })
            topic.publish(message)
        },

        //Joystick mouse action functions        
        publishFromJoystick() {
            if (this.dragging) {
                this.publish(this.joystick.vertical, -this.joystick.horizontal);
            }
        },
        startDrag(event) {
            this.dragging = true;
            if (!this.joystickBaseRect) {
                const base = document.getElementById('joystick-base');
                this.joystickBaseRect = base.getBoundingClientRect();
            }
            this.updateJoystickPosition(event);
        },
        updateJoystickPosition(event) {
            if (!this.dragging) return;
            
            const clientX = event.clientX || event.touches[0].clientX;
            const clientY = event.clientY || event.touches[0].clientY;
            
            // Calculate relative position within joystick base
            const x = clientX - this.joystickBaseRect.left - (this.joystickBaseRect.width / 2);
            const y = clientY - this.joystickBaseRect.top - (this.joystickBaseRect.height / 2);
            
            // Limit to joystick bounds
            const distance = Math.min(Math.sqrt(x*x + y*y), this.joystickBaseRect.width / 2);
            const angle = Math.atan2(y, x);
            
            // Calculate bounded position
            const boundedX = distance * Math.cos(angle);
            const boundedY = distance * Math.sin(angle);
            
            // Update joystick head position
            const joystickHead = document.getElementById('joystick-head');
            joystickHead.style.transform = `translate(calc(-50% + ${boundedX}px), calc(-50% + ${boundedY}px)`;
            
            // Calculate raw numbers first
            const vertical = boundedY / (this.joystickBaseRect.height / 2);
            const horizontal = boundedX / (this.joystickBaseRect.width / 2);
            
            // Store as numbers in data
            this.joystick.vertical = -vertical;
            this.joystick.horizontal = horizontal;
        },
        
        stopDrag() {
            if (!this.dragging) return;
            
            this.dragging = false;
            const joystickHead = document.getElementById('joystick-head');
            joystickHead.style.transform = 'translate(-50%, -50%)';
            
            // Reset joystick values
            this.joystick.vertical = 0;
            this.joystick.horizontal = 0;
            
            // Send stop command
            this.publish(0, 0);
        },
        read_wh_status() {
            // Unsubscribe first if already subscribed
            if (this.statusTopic) {
                this.statusTopic.unsubscribe();
            }

            this.statusTopic = new ROSLIB.Topic({
                ros: this.ros,
                name: '/wh_status',
                messageType: 'std_msgs/String'
            });

            // Use arrow function to maintain 'this' context
            this.statusTopic.subscribe((message) => {
                try {
                    const statusData = typeof message.data === 'string' ? 
                        JSON.parse(message.data) : 
                        message;
                    
                    // Reactively update status with fallback values
                    this.wh_status = {
                        ...this.wh_status, // Keep existing values
                        fail_count: statusData.fail_count || this.wh_status.fail_count,
                        current: statusData.current || this.wh_status.current,
                        start: statusData.start || this.wh_status.start,
                        localize: statusData.localize || this.wh_status.localize,
                        search_cart: statusData.search_cart || this.wh_status.search_cart,
                        attach_cart: statusData.attach_cart || this.wh_status.attach_cart,
                        goto_ship_pose: statusData.goto_ship_pose || this.wh_status.goto_ship_pose,
                        return_home: statusData.return_home || this.wh_status.return_home
                    };
                    
                    // console.log('Status updated:', this.wh_status);
                } catch (error) {
                    console.error('Error parsing status message:', error, message);
                }
            });
        },

        wh_start_request(){
            const wh_start_pub = new ROSLIB.Topic({
                ros: this.ros,
                name: '/wh_automation_start',
                messageType: 'std_msgs/String'
            });
            const startMsg =  new ROSLIB.Message({data: 'start'});
            wh_start_pub.publish(startMsg);
            console.log('Sent trigger to /wh_automation_start');
        },
        wh_autostart_request(){
            const wh_autostart_pub = new ROSLIB.Topic({
                ros: this.ros,
                name: '/wh_automation_autostart',
                messageType: 'std_msgs/String'
            });
            const startMsg =  new ROSLIB.Message({data: 'start'});
            wh_autostart_pub.publish(startMsg);
            console.log('Sent trigger to /wh_automation_autostart');
        },
        localization_request() {
            // Publisher to /wh_glocalization_goal
            const pub = new ROSLIB.Topic({
                ros: this.ros,
                name: '/wh_localize',
                messageType: 'std_msgs/String'
            });
            this.gl_state = 'ready';

            // Publish an empty message to trigger localization
            const startMsg = new ROSLIB.Message({data: 'start'});
            pub.publish(startMsg);
            console.log('Sent trigger to /wh_localize');

            // Subscribe to feedback topic
            const feedbackSub = new ROSLIB.Topic({
                ros: this.ros,
                name: '/wh_localize_feedback',
                messageType: 'std_msgs/String'  // Or use the actual message type if it's custom
            });

            feedbackSub.subscribe((message) => {
                console.log('Feedback:', message.data);
                
                const feedback = message.data;
                const pattern = /cov_x: ([\d.]+), cov_y: ([\d.]+), cov_yaw: ([\d.]+), status: (\w+)/;
                const matches = feedback.match(pattern);
                
                if (matches) {
                    const values = {
                        cov_x: parseFloat(matches[1]),
                        cov_y: parseFloat(matches[2]),
                        cov_yaw: parseFloat(matches[3]),
                        status: matches[4]
                    };
                    
                    console.log('Localize feedback:', values);
                    this.gl_state = values.status;
                }
            });

            // Subscribe to result topic
            const resultSub = new ROSLIB.Topic({
                ros: this.ros,
                name: '/wh_localize_result',
                messageType: 'std_msgs/String'
            });

            resultSub.subscribe((message) => {
                console.log('Result:', message.data);
                const result = message.data;
                const pattern = /success: (\w+), status: (\w+)/;
                const matches = result.match(pattern);
                
                if (matches) {
                    const values = {
                        success: matches[1],
                        status: matches[2]
                    };
                    
                    console.log('Localize result:', values);
                    this.gl_state = values.status;
                }
            });
        },
        wh_search_request(){
            const wh_search_pub = new ROSLIB.Topic({
                ros: this.ros,
                name: '/wh_search',
                messageType: 'std_msgs/String'
            });
            const startMsg =  new ROSLIB.Message({data: 'start'});
            wh_search_pub.publish(startMsg);
            console.log('Sent trigger to /wh_search');
        },
        wh_attach_cart_request(){
            const wh_search_pub = new ROSLIB.Topic({
                ros: this.ros,
                name: '/wh_attach_cart',
                messageType: 'std_msgs/String'
            });
            const startMsg =  new ROSLIB.Message({data: 'start'});
            wh_search_pub.publish(startMsg);
            console.log('Sent trigger to /wh_attach_cart');
        },
        wh_goto_ship_pose_request(){
            const wh_goto_ship_pose_pub = new ROSLIB.Topic({
                ros: this.ros,
                name: '/wh_goto_ship_pose',
                messageType: 'std_msgs/String'
            });
            const startMsg =  new ROSLIB.Message({data: 'start'});
            wh_goto_ship_pose_pub.publish(startMsg);
            console.log('Sent trigger to /wh_goto_ship');
        },
        wh_goto_pose_as_B(){
        const wh_goto_pose_as_B_pub = new ROSLIB.Topic({
                ros: this.ros,
                name: '/wh_goto_pose_as',
                messageType: 'std_msgs/String'
            });
            const poseMsg =  new ROSLIB.Message({data: 'poseb'});
            wh_goto_pose_as_B_pub.publish(poseMsg);
            console.log('Sent trigger to /wh_goto_pose_as');
        },
        wh_goto_pose_as_C(){
        const wh_goto_pose_as_C_pub = new ROSLIB.Topic({
                ros: this.ros,
                name: '/wh_goto_pose_as',
                messageType: 'std_msgs/String'
            });
            const poseMsg =  new ROSLIB.Message({data: 'posec'});
            wh_goto_pose_as_C_pub.publish(poseMsg);
            console.log('Sent trigger to /wh_goto_pose_as');
        },
        wh_goto_pose_as_D(){
        const wh_goto_pose_as_D_pub = new ROSLIB.Topic({
                ros: this.ros,
                name: '/wh_goto_pose_as',
                messageType: 'std_msgs/String'
            });
            const poseMsg =  new ROSLIB.Message({data: 'posed'});
            wh_goto_pose_as_D_pub.publish(poseMsg);
            console.log('Sent trigger to /wh_goto_pose_as');
        },

        wh_return_home_request(){
            const wh_return_home_pub = new ROSLIB.Topic({
                ros: this.ros,
                name: '/wh_return_home',
                messageType: 'std_msgs/String'
            });
            const startMsg =  new ROSLIB.Message({data: 'start'});
            wh_return_home_pub.publish(startMsg);
            console.log('Sent trigger to /wh_return_home');
        },

        wh_elevator_up_request(){
            const wh_elevator_up_pub = new ROSLIB.Topic({
                ros: this.ros,
                name: '/elevator_up',
                messageType: 'std_msgs/String'
            });
            const startMsg =  new ROSLIB.Message({});
            wh_elevator_up_pub.publish(startMsg);
            wh_elevator_up_pub.publish(startMsg);
            console.log('Sent trigger to /elevator_up');
        },

        wh_elevator_down_request(){
            const wh_elevator_down_pub = new ROSLIB.Topic({
                ros: this.ros,
                name: '/elevator_down',
                messageType: 'std_msgs/String'
            });
            const startMsg =  new ROSLIB.Message({});
            wh_elevator_down_pub.publish(startMsg);
            wh_elevator_down_pub.publish(startMsg);
            console.log('Sent trigger to /elevator_down');
        },

        chargeRobot() {
            showAlert('Charging command sent to robot', 'warning');
        },
        resetMapView() {
            if (this.mapGridClient && this.mapViewer && this.mapGridClient.currentGrid) {
                const grid = this.mapGridClient.currentGrid;
                this.scale = 0.14; // Reset to default scale
                this.shift = 0.0;
                this.updateMapTransform();
            }
        },
    
        toggleGrid() {
            const grid = document.querySelector('.map-grid-overlay');
            grid.style.display = grid.style.display === 'none' ? 'block' : 'none';
        },
    
        // Enhanced map viewer setup
        setupMapViewer() {
            this.mapViewer = new ROS2D.Viewer({
                divID: 'generatedMap',
                width: 600,
                height: 600,
                // background: '#0f1219'
            });

            // Optional border for style
            const border = new createjs.Shape();
            border.graphics.beginStroke("#3a3f5c").drawRect(0, 0, 420, 360);
            this.mapViewer.scene.addChild(border);

            // Setup OccupancyGridClient to load the map
            this.mapGridClient = new ROS2D.OccupancyGridClient({
                ros: this.ros,
                rootObject: this.mapViewer.scene,
                continuous: true,
                topic: '/map'
            });

            // When the map is received/updated
            this.mapGridClient.on('change', () => {
                const grid = this.mapGridClient.currentGrid;
                if (grid) {
                    this.mapViewer.scaleToDimensions(grid.width * this.scale, grid.height * this.scale);
                    this.mapViewer.shift(
                        (grid.pose.position.x + this.shift) * this.scale,
                        (grid.pose.position.y - this.shift) * this.scale
                    );             
                }
            });
        },
        updateMapTransform() {
                if (this.mapGridClient && this.mapViewer && this.mapGridClient.currentGrid) {
                    const grid = this.mapGridClient.currentGrid
                    this.mapViewer.scaleToDimensions(grid.width * this.scale, grid.height * this.scale)
                    this.mapViewer.shift(
                        (grid.pose.position.x + this.shift) * this.scale,
                        (grid.pose.position.y - this.shift) * this.scale
                    )
                }
        },
        setupCurrentPose() {

            // Create pose listener
            const poseListener = new ROSLIB.Topic({
                ros: this.ros,
                name: '/wh_current_pose',
                messageType: 'geometry_msgs/PoseStamped'
            });

            // Create robotMarker as a container
            this.robotMarker = new createjs.Container();

            // Load SVG image
            const robotImg = new Image();
            robotImg.src = './images/robot.svg';
            robotImg.onload = () => {
                const bmp = new createjs.Bitmap(robotImg);

                // Scale image (tweak as needed to match map)
                const imgScale = 0.01 * this.scale;
                bmp.scaleX = imgScale;
                bmp.scaleY = imgScale;

                // Align image center to rotation point
                bmp.regX = robotImg.width / 2;
                bmp.regY = robotImg.height / 2;

                // Add to container and scene
                this.robotMarker.addChild(bmp);
                this.robotMarker.visible = false;
                this.mapViewer.scene.addChild(this.robotMarker);
            };

            // Subscribe to pose and update robot marker
            poseListener.subscribe((msg) => {
                const pos = msg.pose.position;
                const q = msg.pose.orientation;

                // Save position
                this.position = pos;

                // Convert quaternion to yaw
                const siny_cosp = 2 * (q.w * q.z + q.x * q.y);
                const cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z);
                const yaw_rad = Math.atan2(siny_cosp, cosy_cosp);
                const yaw_deg = yaw_rad * (180 / Math.PI);

                this.yaw = yaw_deg;

                // Update marker pose on map
                this.robotMarker.x = pos.x * this.scale;
                this.robotMarker.y = -pos.y * this.scale;
                this.robotMarker.rotation = -yaw_deg; // due to flipped Y-axis
                this.robotMarker.visible = true;
            });
        },
        setupCurrentCartPose() {
            // Create pose listener
            const cartPoseListener = new ROSLIB.Topic({
                ros: this.ros,
                name: '/wh_cart_pose',
                messageType: 'geometry_msgs/PoseStamped'
            });

            // Create robotMarker as a container
            this.cartMarker = new createjs.Container();

            // Load SVG image
            const cartImg = new Image();
            cartImg.src = './images/cart.svg';
            cartImg.onload = () => {
                const bmp = new createjs.Bitmap(cartImg);

                // Scale image (tweak as needed to match map)
                const imgScale = 0.02 * this.scale;
                bmp.scaleX = imgScale;
                bmp.scaleY = imgScale;

                // Align image center to rotation point
                bmp.regX = cartImg.width / 2;
                bmp.regY = cartImg.height / 2;

                // Add to container and scene
                this.cartMarker.addChild(bmp);
                this.cartMarker.visible = false;
                this.mapViewer.scene.addChild(this.cartMarker);
            };

            // Subscribe to pose and update robot marker
            cartPoseListener.subscribe((msg) => {
                const pos = msg.pose.position;
                const q = msg.pose.orientation;

                // Save position
                this.position = pos;

                // Convert quaternion to yaw
                const siny_cosp = 2 * (q.w * q.z + q.x * q.y);
                const cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z);
                const yaw_rad = Math.atan2(siny_cosp, cosy_cosp);
                const yaw_deg = yaw_rad * (180 / Math.PI);

                this.yaw = yaw_deg;

                // Update marker pose on map
                this.cartMarker.x = pos.x * this.scale;
                this.cartMarker.y = -pos.y * this.scale;
                this.cartMarker.rotation = -yaw_deg; // due to flipped Y-axis
                this.cartMarker.visible = true;
            });
        }, 
        setupStaticShipImage1() {
            this.shipMarker1 = new createjs.Container();
            const shipImg1 = new Image(); shipImg1.src = './images/shipA.svg';
            
            shipImg1.onload = () => {
                const bmp = new createjs.Bitmap(shipImg1);
                const imgScale = 0.012 * this.scale;
                bmp.scaleX = imgScale;
                bmp.scaleY = imgScale;

                // Center the image
                bmp.regX = shipImg1.width / 2;
                bmp.regY = shipImg1.height / 2;

                // Add to container and scene
                this.shipMarker1.addChild(bmp);
                this.mapViewer.scene.addChild(this.shipMarker1); // Fixed: was adding robotMarker
                
                // Set static position (ensure wp1 is defined in your data)
                this.shipMarker1.x = this.wp1.x * this.scale;
                this.shipMarker1.y = -this.wp1.y * this.scale;
                this.shipMarker1.rotation = -this.wp1.yaw;
                this.shipMarker1.visible = true;
                
                this.mapViewer.stage.update();
            };
        },
        setupStaticShipImage2() {          
            this.shipMarker2 = new createjs.Container();
            const shipImg2 = new Image(); shipImg2.src = './images/shipB.svg';         

            shipImg2.onload = () => {
                const bmp = new createjs.Bitmap(shipImg2);
                const imgScale = 0.015 * this.scale;
                bmp.scaleX = imgScale;
                bmp.scaleY = imgScale;

                // Center the image
                bmp.regX = shipImg2.width / 2;
                bmp.regY = shipImg2.height / 2;

                // Add to container and scene
                this.shipMarker2.addChild(bmp);
                this.mapViewer.scene.addChild(this.shipMarker2); // Fixed: was adding robotMarker
                
                // Set static position (ensure wp1 is defined in your data)
                this.shipMarker2.x = this.wp2.x * this.scale;
                this.shipMarker2.y = -this.wp2.y * this.scale;
                this.shipMarker2.rotation = -this.wp2.yaw;
                this.shipMarker2.visible = true;
                
                this.mapViewer.stage.update();
            };
        },
        setupStaticShipImage3() {
            this.shipMarker3 = new createjs.Container();
            const shipImg3 = new Image(); shipImg3.src = './images/shipC.svg';   


            shipImg3.onload = () => {
                const bmp = new createjs.Bitmap(shipImg3);
                const imgScale = 0.015 * this.scale;
                bmp.scaleX = imgScale;
                bmp.scaleY = imgScale;

                // Center the image
                bmp.regX = shipImg3.width / 2;
                bmp.regY = shipImg3.height / 2;

                // Add to container and scene
                this.shipMarker3.addChild(bmp);
                this.mapViewer.scene.addChild(this.shipMarker3); // Fixed: was adding robotMarker
                
                // Set static position (ensure wp1 is defined in your data)
                this.shipMarker3.x = this.wp3.x * this.scale;
                this.shipMarker3.y = -this.wp3.y * this.scale;
                this.shipMarker3.rotation = -this.wp3.yaw;
                this.shipMarker3.visible = true;
                
                this.mapViewer.stage.update();
            };
        },
        setupStaticShipImage4() {
            this.shipMarker4 = new createjs.Container();
            const shipImg4 = new Image(); shipImg4.src = './images/shipD.svg';
            
            shipImg4.onload = () => {
                const bmp = new createjs.Bitmap(shipImg4);
                const imgScale = 0.015 * this.scale;
                bmp.scaleX = imgScale;
                bmp.scaleY = imgScale;

                // Center the image
                bmp.regX = shipImg4.width / 2;
                bmp.regY = shipImg4.height / 2;

                // Add to container and scene
                this.shipMarker4.addChild(bmp);
                this.mapViewer.scene.addChild(this.shipMarker4); // Fixed: was adding robotMarker
                
                // Set static position (ensure wp1 is defined in your data)
                this.shipMarker4.x = this.wp4.x * this.scale;
                this.shipMarker4.y = -this.wp4.y * this.scale;
                this.shipMarker4.rotation = -this.wp4.yaw;
                this.shipMarker4.visible = true;
                
                this.mapViewer.stage.update();
            };            
        },
        
    },
    // End of Methods
    mounted() {
        // Initialize joystick base dimensions
        this.$nextTick(() => {
            const joystickBase = document.getElementById('joystick-base');
            if (joystickBase) {
                this.joystickBaseRect = joystickBase.getBoundingClientRect();
            }
            
            // Set up event listeners
            const joystickHead = document.getElementById('joystick-head');
            joystickHead.addEventListener('mousedown', this.startDrag);
            joystickHead.addEventListener('touchstart', this.startDrag, { passive: false });
            
            document.addEventListener('mousemove', this.updateJoystickPosition);
            document.addEventListener('touchmove', this.updateJoystickPosition, { passive: false });
            
            document.addEventListener('mouseup', this.stopDrag);
            document.addEventListener('touchend', this.stopDrag);
        });
         // Check Glocalization action server status every 5 seconds
        this.serverCheckInterval = setInterval(this.checkActionServer, 500);

        this.interval = setInterval(() => {
            if (this.ros != null && this.ros.isConnected) {
                this.ros.getNodes((data) => { }, (error) => { })
            }
        }, 10000)
    },
    beforeDestroy() {
        clearInterval(this.serverCheckInterval);
    },
});
