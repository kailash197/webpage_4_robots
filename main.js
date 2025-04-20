var app = new Vue({
    el: '#app',
    // storing the state of the page
    data: {
        connected: false,
        ros: null,
        logs: [],
        loading: false,
        rosbridge_address: 'wss://i-0ea0270f46e7f304b.robotigniteacademy.com/ae712ee2-cc72-4059-a83e-307c84cd5b3e/rosbridge/',
        port: '9090',
        // 3D stuff
        viewer: null,
        tfClient: null,
        urdfClient: null,

        // dragging data
        dragging: false,
        x: 'no',
        y: 'no',
        dragCircleStyle: {
            margin: '0px',
            top: '0px',
            left: '0px',
            display: 'none',
            width: '75px',
            height: '75px',
        },
        // joystick valules
        joystick: {
            vertical: 0,
            horizontal: 0,
        },
        // publisher
        pubInterval: null,
        // ODOM subscriber data
        position: { x: 0, y: 0, z: 0, },
        yaw: 0,
        //Map Viewer
        mapViewer: null,
        mapGridClient: null,
        interval: null,
        scale: 0.14,
        shift: 0.0,
        //Waypoint Action Server
        goal: null,
        action: {
            goal: { position: {x: 0, y: 0, z: 0} },
            feedback: { position: {x: 0, y: 0, z: 0}, state: 'idle' },
            result: { success: false },
            status: { status: 0, text: '' },
        },
        //Predefined waypoints
        waypoints: [
            { x: +0.14, y: -0.50 }, //WP0
            { x: +0.64, y: -0.50 }, //WP1
            { x: +0.64, y: -0.00 }, //WP2
            { x: +0.64, y: +0.50 }, //WP3
            { x: +0.23, y: +0.50 }, //WP4
            { x: +0.23, y: +0.00 }, //WP5
            { x: -0.10, y: +0.00 }, //WP6
            { x: -0.16, y: +0.50 }, //WP7
            { x: -0.64, y: +0.50 }, //WP8
            { x: -0.16, y: -0.50 }, //WP9
            { x: -0.45, y: -0.50 }, //WP10
        ],
    },
    watch: {
        scale(val) {
            this.updateMapTransform()
        },
        shift(val) {
            this.updateMapTransform()
        }
    },
    // helper methods to connect to ROS
    methods: {
        connect: function() {
            this.loading = true
            this.ros = new ROSLIB.Ros({
                url: this.rosbridge_address
            })
            this.ros.on('connection', () => {
                this.logs.unshift((new Date()).toTimeString() + ' - Connected!')
                this.connected = true
                this.loading = false
                this.setCamera()
                this.setup3DViewer()
                this.pubInterval = setInterval(this.publish, 100)
                this.setupCurrentPose()
                this.setupMapViewer()
            })
            this.ros.on('error', (error) => {
                this.logs.unshift((new Date()).toTimeString() + ` - Error: ${error}`)
            })
            this.ros.on('close', () => {
                this.logs.unshift((new Date()).toTimeString() + ' - Disconnected!')
                this.connected = false
                this.loading = false
                document.getElementById('divCamera').innerHTML = ''
                this.unset3DViewer()
                clearInterval(this.pubInterval)
                // ODOM subscriber data
                this.position = { x: 0, y: 0, z: 0, }
                this.yaw = 0
                this.unsetMapViewer()
            })
        },
        disconnect: function() {
            this.ros.close()
            this.goal = null
        },
        setCamera: function() {
            let without_wss = this.rosbridge_address.split('wss://')[1]
            console.log(without_wss)
            let domain = without_wss.split('/')[0] + '/' + without_wss.split('/')[1]
            console.log(domain)
            let host = domain + '/cameras'
            let viewer = new MJPEGCANVAS.Viewer({
                divID: 'divCamera',
                host: host,
                width: 320,
                height: 240,
                topic: '/camera/image_raw',
                ssl: true,
            })
        },
        setup3DViewer() {
            this.viewer = new ROS3D.Viewer({
                background: '#cccccc',
                divID: 'div3DViewer',
                width: 400,
                height: 300,
                antialias: true,
                fixedFrame: 'odom'
            })

            // Add a grid.
            this.viewer.addObject(new ROS3D.Grid({
                color:'#0181c4',
                cellSize: 0.5,
                num_cells: 20
            }))

            // Setup a client to listen to TFs.
            this.tfClient = new ROSLIB.TFClient({
                ros: this.ros,
                angularThres: 0.01,
                transThres: 0.01,
                rate: 10.0
            })

            // Setup the URDF client.
            this.urdfClient = new ROS3D.UrdfClient({
                ros: this.ros,
                param: 'robot_description',
                tfClient: this.tfClient,
                // We use "path: location.origin + location.pathname"
                // instead of "path: window.location.href" to remove query params,
                // otherwise the assets fail to load
                path: location.origin + location.pathname,
                rootObject: this.viewer.scene,
                loader: ROS3D.COLLADA_LOADER_2
            })
        },
        unset3DViewer() {
            document.getElementById('div3DViewer').innerHTML = ''
        },
        publish: function() {
            let topic = new ROSLIB.Topic({
                ros: this.ros,
                name: '/cmd_vel',
                messageType: 'geometry_msgs/Twist'
            })
            let message = new ROSLIB.Message({
                linear: { x: this.joystick.vertical, y: 0, z: 0, },
                angular: { x: 0, y: 0, z: -this.joystick.horizontal, },
            })
            topic.publish(message)
        },
        startDrag() {
            this.dragging = true
            this.x = this.y = 0
        },
        stopDrag() {
            this.dragging = false
            this.x = this.y = 'no'
            this.dragCircleStyle.display = 'none'
            this.resetJoystickVals()
        },
        doDrag(event) {
            if (this.dragging) {
                this.x = event.offsetX
                this.y = event.offsetY
                let ref = document.getElementById('dragstartzone')
                this.dragCircleStyle.display = 'inline-block'

                let minTop = ref.offsetTop - parseInt(this.dragCircleStyle.height) / 2
                let maxTop = minTop + 200
                let top = this.y + minTop
                this.dragCircleStyle.top = `${top}px`

                let minLeft = ref.offsetLeft - parseInt(this.dragCircleStyle.width) / 2
                let maxLeft = minLeft + 200
                let left = this.x + minLeft
                this.dragCircleStyle.left = `${left}px`

                this.setJoystickVals()
            }
        },
        setJoystickVals() {
            this.joystick.vertical = -1 * ((this.y / 200) - 0.5)
            this.joystick.horizontal = +1 * ((this.x / 200) - 0.5)
        },
        resetJoystickVals() {
            this.joystick.vertical = 0
            this.joystick.horizontal = 0
        },
        setupCurrentPose() {
            let topic = new ROSLIB.Topic({
                ros: this.ros,
                name: '/odom',
                messageType: 'nav_msgs/Odometry'
            })
            topic.subscribe((message) => {
                this.position = message.pose.pose.position

                // Convert quaternion to yaw
                const q = message.pose.pose.orientation
                const siny_cosp = 2 * (q.w * q.z + q.x * q.y)
                const cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z)
                const yaw_rad = Math.atan2(siny_cosp, cosy_cosp)
                this.yaw = yaw_rad * 180 / Math.PI
            })
        },
        setupMapViewer() {
            this.mapViewer = new ROS2D.Viewer({
                divID: 'generatedMap',
                width: 420,
                height: 360
            })

            this.mapGridClient = new ROS2D.OccupancyGridClient({
                ros: this.ros,
                rootObject: this.mapViewer.scene,
                continuous: true,
            })

            this.mapGridClient.on('change', () => {
                const grid = this.mapGridClient.currentGrid
                this.mapViewer.scaleToDimensions(grid.width * this.scale, grid.height * this.scale)
                this.mapViewer.shift(
                    (grid.pose.position.x + this.shift) * this.scale,
                    (grid.pose.position.y - this.shift) * this.scale
                )
            })
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
        unsetMapViewer() {
            document.getElementById('generatedMap').innerHTML = ''
        },
        sendGoal: function() {
            let actionClient = new ROSLIB.ActionClient({
                ros : this.ros,
                serverName : '/tortoisebot_as',
                actionName : 'course_web_dev_ros/WaypointActionAction'
            })

            this.goal = new ROSLIB.Goal({
                actionClient : actionClient,
                goalMessage: {
                    ...this.action.goal
                }
            })

            this.goal.on('status', (status) => {
                this.action.status = status
            })

            this.goal.on('feedback', (feedback) => {
                this.action.feedback = feedback
            })

            this.goal.on('result', (result) => {
                this.action.result = result
            })
            this.goal.send()
        },
        cancelGoal: function() {
            this.goal.cancel()
        },
        gotoWaypoint(index) {
            const wp = this.waypoints[index];
            if (!wp) return;
            this.action.goal.position.x = wp.x;
            this.action.goal.position.y = wp.y;
            this.sendGoal();
        },
    },
    mounted() {
        // page is ready
        window.addEventListener('mouseup', this.stopDrag)
        this.interval = setInterval(() => {
            if (this.ros != null && this.ros.isConnected) {
                this.ros.getNodes((data) => { }, (error) => { })
            }
        }, 10000)
    },
})
