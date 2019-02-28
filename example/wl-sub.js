'use strict';

const rclnodejs = require('../index.js');

rclnodejs.init().then(() => {
  const node = rclnodejs.createNode('subscription_example_node');

  node.createSubscription('std_msgs/msg/String', '/chatter', (msg) => {
    console.log(`Received message: ${typeof msg}`,msg.data.length);
    console.log(msg);
  });

  rclnodejs.spin(node);
});

