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
        
        // // Robot Data
        // robots: [
        //     { id: 'R-001', status: 'active', battery: 85, x: 200, y: 150 },
        //     { id: 'R-002', status: 'charging', battery: 45, x: 350, y: 400 },
        //     { id: 'R-003', status: 'active', battery: 65, x: 450, y: 250 }
        // ],
        // activeRobot: 'R-001',
        
        // // Alert System
        // alert: {
        //     show: false,
        //     message: '',
        //     type: 'success'
        // },
        
        // // Joystick Control
        // dragging: false,
        // joystick: {
        //     vertical: 0,
        //     horizontal: 0
        // }
    },
    methods: {
        connectROS: function () {
            console.log(`Inside connectROS`);
            this.loading = true
            this.ros = new ROSLIB.Ros({
                url: this.rosbridge_address
            })
            this.ros.on('connection', () => {
                this.logs.unshift((new Date()).toTimeString() + ' - Connected!')
                this.rosbridge_connected = true
                this.loading = false
                // this.pubInterval = setInterval(this.publish, 100)
                this.detectEnvironment()
            })
            this.ros.on('error', (error) => {
                this.logs.unshift((new Date()).toTimeString() + ` - Error: ${error}`)
            })
            this.ros.on('close', () => {
                this.logs.unshift((new Date()).toTimeString() + ' - Disconnected!')
                this.rosbridge_connected = false
                this.loading = false
                clearInterval(this.pubInterval)
            })
        },
        disconnectROS: function () {
            console.log(`Inside disconnectROS`);
            this.ros.close()
            this.goal = null
        },

        // detect the environment: sim or real
        detectEnvironment() {
            console.log(`Inside detectEnvironment`);
            this.ros.getTopics((topics) => {
                const topicList = topics.topics;

                if (
                    topicList.includes('/diffbot_base_controller/cmd_vel_unstamped')
                ) {
                    // Simulated environment
                    this.env = 'sim';
                    this.cmdtopic = '/diffbot_base_controller/cmd_vel_unstamped';
                } else {
                    // Real environment
                    this.env = 'real';
                    this.cmdtopic = '/cmd_vel';
                }

                console.log(`Detected ENV: ${this.env}`);
                console.log(`CMD Topic: ${this.cmdtopic}`);
            }, (err) => {
                console.error('Error getting topics:', err);
                // Fallback to real
                this.env = 'real';
                this.cmdtopic = '/cmd_vel';
            });
        },
        
        // selectRobot(robotId) {
        //     this.activeRobot = robotId;
        //     this.showAlert(`Selected ${robotId}`, 'success');
        // },
        
        // moveRobot(direction) {
        //     if (!this.activeRobot) {
        //         this.showAlert('No robot selected', 'warning');
        //         return;
        //     }
            
        //     const robot = this.robots.find(r => r.id === this.activeRobot);
        //     const directions = {
        //         'forward': { x: 0, y: -10 },
        //         'backward': { x: 0, y: 10 },
        //         'left': { x: -10, y: 0 },
        //         'right': { x: 10, y: 0 }
        //     };
            
        //     if (directions[direction]) {
        //         robot.x += directions[direction].x;
        //         robot.y += directions[direction].y;
                
        //         // Keep within bounds
        //         robot.x = Math.max(20, Math.min(580, robot.x));
        //         robot.y = Math.max(20, Math.min(580, robot.y));
                
        //         this.showAlert(`Moving ${direction}`, 'success');
        //     }
        // },
        
        // showAlert(message, type) {
        //     this.alert = {
        //         show: true,
        //         message: message,
        //         type: type
        //     };
            
        //     setTimeout(() => {
        //         this.alert.show = false;
        //     }, 3000);
        // },
        
        // // Joystick methods
        // startDrag(event) {
        //     this.dragging = true;
        //     this.updateJoystick(event);
        // },
        
        // updateJoystick(event) {
        //     if (!this.dragging) return;
            
        //     const joystickBase = document.getElementById('joystick-base');
        //     const rect = joystickBase.getBoundingClientRect();
        //     const centerX = rect.width / 2;
        //     const centerY = rect.height / 2;
            
        //     const clientX = event.clientX || event.touches[0].clientX;
        //     const clientY = event.clientY || event.touches[0].clientY;
            
        //     const x = clientX - rect.left - centerX;
        //     const y = clientY - rect.top - centerY;
        //     const distance = Math.min(Math.sqrt(x*x + y*y), centerX - 30);
            
        //     const angle = Math.atan2(y, x);
        //     const newX = distance * Math.cos(angle);
        //     const newY = distance * Math.sin(angle);
            
        //     document.getElementById('joystick-head').style.transform = 
        //         `translate(calc(-50% + ${newX}px), calc(-50% + ${newY}px)`;
            
        //     // Calculate direction
        //     this.joystick.horizontal = (newX / (centerX - 30)).toFixed(2);
        //     this.joystick.vertical = (newY / (centerY - 30)).toFixed(2);
            
        //     // Determine movement direction
        //     if (Math.abs(this.joystick.horizontal) > 0.3 || Math.abs(this.joystick.vertical) > 0.3) {
        //         let direction = 'stop';
        //         if (Math.abs(this.joystick.horizontal) > Math.abs(this.joystick.vertical)) {
        //             direction = this.joystick.horizontal > 0 ? 'right' : 'left';
        //         } else {
        //             direction = this.joystick.vertical > 0 ? 'backward' : 'forward';
        //         }
        //         this.moveRobot(direction);
        //     }
        // },
        
        // endDrag() {
        //     this.dragging = false;
        //     document.getElementById('joystick-head').style.transform = 'translate(-50%, -50%)';
        //     this.joystick = { vertical: 0, horizontal: 0 };
        // }
    },
    // mounted() {
    //     // Set up event listeners for joystick
    //     const joystickHead = document.getElementById('joystick-head');
    //     joystickHead.addEventListener('mousedown', this.startDrag);
    //     joystickHead.addEventListener('touchstart', this.startDrag);
        
    //     document.addEventListener('mousemove', this.updateJoystick);
    //     document.addEventListener('touchmove', this.updateJoystick);
        
    //     document.addEventListener('mouseup', this.endDrag);
    //     document.addEventListener('touchend', this.endDrag);
        
    //     // Simulate random movement
    //     setInterval(() => {
    //         this.robots.forEach(robot => {
    //             if (robot.status === 'active') {
    //                 robot.x += Math.floor(Math.random() * 10) - 5;
    //                 robot.y += Math.floor(Math.random() * 10) - 5;
                    
    //                 robot.x = Math.max(20, Math.min(580, robot.x));
    //                 robot.y = Math.max(20, Math.min(580, robot.y));
    //             }
    //         });
    //     }, 2000);
    // }
    mounted() {
        // page is ready
        window.addEventListener('mouseup', this.stopDrag)
        this.interval = setInterval(() => {
            if (this.ros != null && this.ros.isConnected) {
                this.ros.getNodes((data) => { }, (error) => { })
            }
        }, 10000)
    },
});