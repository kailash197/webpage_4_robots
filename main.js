new Vue({
    el: '#app',
    data: {
        // ROS Connection
        rosbridge_connected: false,
        ros: null,
        rosbridge_address: 'wss://i-03eec067a3a3209d8.robotigniteacademy.com/87f7f588-75a4-4adb-b16d-15635e901f1f/rosbridge/',
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
            return_home: 'inactive'
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
    },
    watch: {
        scale(val) {
            this.updateMapTransform()
        },
        shift(val) {
            this.updateMapTransform()
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
                this.setupCurrentPose()
                this.setupMapViewer()
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
                } else {
                    // Real environment
                    this.env = 'real';
                    this.cmdtopic = '/cmd_vel';
                }
                console.log(`Environment: ${this.env}, CMD Topic: ${this.cmdtopic}`);
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
        // Alert notification system
        showAlert(message, type) {
            const alert = document.getElementById('alert');
            alert.querySelector('.alert-message').textContent = message;
            alert.className = 'alert';
            alert.classList.add('show', `alert-${type}`);

            setTimeout(() => {
                alert.classList.remove('show');
            }, 3000);
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
                width: 420,
                height: 360,
                // background: '#0f1219'
            });

            // Add some futuristic elements to the scene
            const border = new createjs.Shape();
            border.graphics.beginStroke("#3a3f5c").drawRect(0, 0, 420, 360);
            this.mapViewer.scene.addChild(border);

            this.mapGridClient = new ROS2D.OccupancyGridClient({
                ros: this.ros,
                rootObject: this.mapViewer.scene,
                continuous: true,
                topic: '/map'
            });

            this.mapGridClient.on('change', () => {
                const grid = this.mapGridClient.currentGrid;
                if (grid) {
                    this.mapViewer.scaleToDimensions(grid.width * this.scale, grid.height * this.scale);
                    this.mapViewer.shift(
                        (grid.pose.position.x + this.shift) * this.scale,
                        (grid.pose.position.y - this.shift) * this.scale
                    );
                    
                    // Add some visual enhancements
                    // this.addMapDecorations(grid);
                }
            });
        },
    
        addMapDecorations(grid) {
            // Remove any existing decorations
            this.mapViewer.scene.removeChild(this.mapDecorations);
            
            // Create new decorations
            this.mapDecorations = new createjs.Container();
            
            // Add grid coordinates
            for (let x = 0; x < grid.width; x += 10) {
                for (let y = 0; y < grid.height; y += 10) {
                    const coordText = new createjs.Text(
                        `${x},${y}`, 
                        "8px Arial", 
                        "#3a3f5c"
                    );
                    coordText.x = x;
                    coordText.y = y;
                    this.mapDecorations.addChild(coordText);
                }
            }
            
            this.mapViewer.scene.addChild(this.mapDecorations);
        },

        updateMapTransform() {
                console.log(this.scale);
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
            let topic = new ROSLIB.Topic({
                ros: this.ros,
                name: '/wh_current_pose',
                messageType: 'geometry_msgs/PoseStamped'
            })
            topic.subscribe((message) => {
                console.log("current pose callabkc")
                this.position = message.pose.position

                // Convert quaternion to yaw
                const q = message.pose.orientation
                const siny_cosp = 2 * (q.w * q.z + q.x * q.y)
                const cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z)
                const yaw_rad = Math.atan2(siny_cosp, cosy_cosp)
                this.yaw = yaw_rad * 180 / Math.PI
            })
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
        // this.checkActionServer();
        // this.setupCurrentPose();

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
