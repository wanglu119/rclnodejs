'use strict';

const rclnodejs = require('../index.js');

rclnodejs.init().then(() => {
  const node = rclnodejs.createNode('subscription_example_node');

  node.createSubscription('dataspeed_can_msgs/msg/CanMessageStamped', '/can', (msg) => {
    console.log(`Received message: ${typeof msg}`,msg);
  });

  rclnodejs.spin(node);
});

