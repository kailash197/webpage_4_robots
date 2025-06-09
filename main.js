new Vue({
    el: '#app',
    data: {
        // ROS Connection
        rosbridge_connected: false,
        ros: null,
        rosbridge_address: 'wss://i-0cf0fb5756a59337f.robotigniteacademy.com/4f333597-9bfe-4125-a0c4-b123877b5d1d/rosbridge/',
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
        joystickBaseRect: null
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
                this.detectEnvironment()
            })
            this.ros.on('error', (error) => {
                this.logs.unshift((new Date()).toTimeString() + ` - Error: ${error}`)
                this.loading = false;
            })
            this.ros.on('close', () => {
                this.logs.unshift((new Date()).toTimeString() + ' - Disconnected!')
                this.rosbridge_connected = false
                this.loading = false
                clearInterval(this.pubInterval)
            })
        },
        disconnectROS: function () {
            console.log('Disconnecting from ROS...');
            if (this.ros) {
                this.ros.close();
            }
            this.goal = null
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
    },

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
    },
});
