// Copyright (c) 2017 Intel Corporation. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

const rclnodejs = require('bindings')('rclnodejs');
const Timer = require('./timer.js');
const Publisher = require('./publisher.js');
const Subscription = require('./subscription.js');
const Client = require('./client.js');
const Service = require('./service.js');
const QoS = require('./qos.js');
const debug = require('debug')('rclnodejs:node');
const loader = require('./interface_loader.js');
const Context = require('./context.js');
/**
 * @class - Class representing a Node in ROS
 * @hideconstructor
 */

class Node {
  init(name, namespace) {
    this._publishers = [];
    this._subscriptions = [];
    this._clients = [];
    this._services = [];
    this._timers = [];
    this._name = name;

    if (namespace.length === 0) {
      namespace = '/';
    } else if (!namespace.startsWith('/')) {
      namespace = '/' + namespace;
    }
    this._namespace = namespace;
    this.spinning = false;
  }

  execute() {
    this._timers.forEach((timer) => {
      if (timer.isReady()) {
        rclnodejs.callTimer(timer.handle);
        timer.callback();
      }
    });

    this._subscriptions.forEach((subscription) => {
      let Message = subscription.typeClass;
      let msg = new Message();
      let success = rclnodejs.rclTake(subscription.handle, msg.toRawROS());
      if (success) {
        subscription.processResponse(msg.refObject);
      }
      Message.destoryRawROS(msg);
    });

    this._clients.forEach((client) => {
      let Response = client.typeClass.Response;
      let response = new Response();
      let success = rclnodejs.rclTakeResponse(client.handle, client.sequenceNumber, response.toRawROS());
      if (success) {
        client.processResponse(response.refObject);
      }
      Response.destoryRawROS(response);
    });

    this._services.forEach((service) => {
      let Request = service.typeClass.Request;
      let request = new Request();
      let header = rclnodejs.rclTakeRequest(service.handle, this.handle, request.toRawROS());
      if (header) {
        service.processRequest(header, request.refObject);
      }
      Request.destoryRawROS(request);
    });
  }

  startSpinning(context) {
    this.start(context);
    this.spinning = true;
  }

  stopSpinning() {
    this.stop();
    this.spinning = false;
  }

  _removeEntityFromArray(entity, array) {
    let index = array.indexOf(entity);
    if (index > -1) {
      array.splice(index, 1);
    }
  }

  _destroyEntity(entity, array, syncHandles = true) {
    this._removeEntityFromArray(entity, array);
    if (syncHandles) {
      this.syncHandles();
    }
    entity.handle.release();
  }

  _validateOptions(options) {
    if (options !== undefined &&
        (options === null || typeof options !== 'object')) {
      throw new TypeError('Invalid argument of options');
    }

    if (options === undefined) {
      options = {enableTypedArray: true, qos: QoS.profileDefault};
      return options;
    }

    if (options.enableTypedArray === undefined) {
      options = Object.assign(options, {enableTypedArray: true});
    }

    if (options.qos === undefined) {
      options = Object.assign(options, {qos: QoS.profileDefault});
    }
    return options;
  }

  /**
   * Create a Timer.
   * @param {number} period - The number representing period in millisecond.
   * @param {function} callback - The callback to be called when timeout.
   * @param {Context} context - The context, default is Context.defaultContext().
   * @return {Timer} - An instance of Timer.
   */
  createTimer(period, callback, context = Context.defaultContext()) {
    if (typeof (period) !== 'number' || typeof (callback) !== 'function') {
      throw new TypeError('Invalid argument');
    }

    // The period unit is millisecond in JavaScript side. When being passed to the
    // C++ side, the value will be converted to nanosecond, which goes into a uint64_t
    // with maxmium value of 2^64-1. So the maxmium is UINT64_MAX in ns, that's 0x10c6f7a0b5ed in ms.
    const MAX_TIMER_PERIOD_IN_MILLISECOND = 0x10c6f7a0b5ed;
    if (period > 0x10c6f7a0b5ed || period < 0) {
      throw new RangeError('Parameter must be between ' + 0 + ' and ' + MAX_TIMER_PERIOD_IN_MILLISECOND);
    }

    let timerHandle = rclnodejs.createTimer(period, context.handle());
    let timer = new Timer(timerHandle, period, callback);
    debug('Finish creating timer, period = %d.', period);
    this._timers.push(timer);
    this.syncHandles();

    return timer;
  }

  /**
   * Create a Publisher.
   * @param {function|string|object} typeClass - The ROS message class,
        OR a string representing the message class, e.g. 'std_msgs/msg/String',
        OR an object representing the message class, e.g. {package: 'std_msgs', type: 'msg', name: 'String'}
   * @param {string} topic - The name of the topic.
   * @param {object} options - The options argument used to parameterize the publisher.
   * @param {boolean} options.enableTypedArray - The topic will use TypedArray if necessary, default: true.
   * @param {QoS} options.qos - ROS Middleware "quality of service" settings for the publisher, default: QoS.profileDefault.
   * @return {Publisher} - An instance of Publisher.
   */
  createPublisher(typeClass, topic, options) {
    if (typeof (typeClass) === 'string' || typeof (typeClass) === 'object') {
      typeClass = loader.loadInterface(typeClass);
    }
    options = this._validateOptions(options);

    if (typeof (typeClass) !== 'function' || typeof (topic) !== 'string') {
      throw new TypeError('Invalid argument');
    }

    let publisher = Publisher.createPublisher(this.handle, typeClass, topic, options);
    debug('Finish creating publisher, topic = %s.', topic);
    this._publishers.push(publisher);
    return publisher;
  }

  /**
   * This callback is called when a message is published
   * @callback SubscriptionCallback
   * @param {Object} message - The message published
   * @see [Node.createSubscription]{@link Node#createSubscription}
   * @see [Node.createPublisher]{@link Node#createPublisher}
   * @see {@link Publisher}
   * @see {@link Subscription}
   */

  /**
   * Create a Subscription.
   * @param {function|string|object} typeClass - The ROS message class,
        OR a string representing the message class, e.g. 'std_msgs/msg/String',
        OR an object representing the message class, e.g. {package: 'std_msgs', type: 'msg', name: 'String'}
   * @param {string} topic - The name of the topic.
   * @param {object} options - The options argument used to parameterize the subscription.
   * @param {boolean} options.enableTypedArray - The topic will use TypedArray if necessary, default: true.
   * @param {QoS} options.qos - ROS Middleware "quality of service" settings for the subscription, default: QoS.profileDefault.
   * @param {SubscriptionCallback} callback - The callback to be call when receiving the topic subscribed.
   * @return {Subscription} - An instance of Subscription.
   * @see {@link SubscriptionCallback}
   */
  createSubscription(typeClass, topic, options, callback) {
    if (typeof (typeClass) === 'string' || typeof (typeClass) === 'object') {
      typeClass = loader.loadInterface(typeClass);
    }

    if (typeof options === 'function') {
      callback = options;
      options = undefined;
    }
    options = this._validateOptions(options);

    if (typeof (typeClass) !== 'function' || typeof (topic) !== 'string' || typeof (callback) !== 'function') {
      throw new TypeError('Invalid argument');
    }

    let subscription = Subscription.createSubscription(this.handle, typeClass, topic, options, callback);
    debug('Finish creating subscription, topic = %s.', topic);
    this._subscriptions.push(subscription);
    this.syncHandles();

    return subscription;
  }

  /**
   * Create a Client.
   * @param {function|string|object} typeClass - The ROS message class,
        OR a string representing the message class, e.g. 'std_msgs/msg/String',
        OR an object representing the message class, e.g. {package: 'std_msgs', type: 'msg', name: 'String'}
   * @param {string} serviceName - The service name to request.
   * @param {object} options - The options argument used to parameterize the client.
   * @param {boolean} options.enableTypedArray - The response will use TypedArray if necessary, default: true.
   * @param {QoS} options.qos - ROS Middleware "quality of service" settings for the client, default: QoS.profileDefault.
   * @return {Client} - An instance of Client.
   */
  createClient(typeClass, serviceName, options) {
    if (typeof (typeClass) === 'string' || typeof (typeClass) === 'object') {
      typeClass = loader.loadInterface(typeClass);
    }
    options = this._validateOptions(options);

    if (typeof (typeClass) !== 'function' || typeof (serviceName) !== 'string') {
      throw new TypeError('Invalid argument');
    }

    let client = Client.createClient(this.handle, serviceName, typeClass, options);
    debug('Finish creating client, service = %s.', serviceName);
    this._clients.push(client);
    this.syncHandles();

    return client;
  }

  /**
   * This callback is called when a request is sent to service
   * @callback RequestCallback
   * @param {Object} request - The request sent to the service
   * @param {Response} response - The response to client.
        Use [response.send()]{@link Response#send} to send response object to client
   * @return {undefined}
   * @see [Node.createService]{@link Node#createService}
   * @see [Client.sendRequest]{@link Client#sendRequest}
   * @see {@link Client}
   * @see {@link Service}
   * @see {@link Response#send}
   */

  /**
   * Create a Service.
   * @param {function|string|object} typeClass - The ROS message class,
        OR a string representing the message class, e.g. 'std_msgs/msg/String',
        OR an object representing the message class, e.g. {package: 'std_msgs', type: 'msg', name: 'String'}
   * @param {string} serviceName - The service name to offer.
   * @param {object} options - The options argument used to parameterize the service.
   * @param {boolean} options.enableTypedArray - The request will use TypedArray if necessary, default: true.
   * @param {QoS} options.qos - ROS Middleware "quality of service" settings for the service, default: QoS.profileDefault.
   * @param {RequestCallback} callback - The callback to be called when receiving request.
   * @return {Service} - An instance of Service.
   * @see {@link RequestCallback}
   */
  createService(typeClass, serviceName, options, callback) {
    if (typeof (typeClass) === 'string' || typeof (typeClass) === 'object') {
      typeClass = loader.loadInterface(typeClass);
    }

    if (typeof options === 'function') {
      callback = options;
      options = undefined;
    }
    options = this._validateOptions(options);

    if (typeof (typeClass) !== 'function' || typeof (serviceName) !== 'string' || typeof (callback) !== 'function') {
      throw new TypeError('Invalid argument');
    }

    let service = Service.createService(this.handle, serviceName, typeClass, options, callback);
    debug('Finish creating service, service = %s.', serviceName);
    this._services.push(service);
    this.syncHandles();

    return service;
  }

  /**
   * Destroy all resource allocated by this node, including
   * <code>Timer</code>s/<code>Publisher</code>s/<code>Subscription</code>s
   * /<code>Client</code>s/<code>Service</code>s
   * @return {undefined}
   */
  destroy() {
    if (this.spinning) {
      this.stopSpinning();
    }

    this.handle.release();
    this._timers = [];
    this._publishers = [];
    this._subscriptions = [];
    this._clients = [];
    this._services = [];
  }

  /**
   * Destroy a Publisher.
   * @param {Publisher} publisher - The Publisher to be destroyed.
   * @return {undefined}
   */
  destroyPublisher(publisher) {
    if (!(publisher instanceof Publisher)) {
      throw new TypeError('Invalid argument');
    }
    this._destroyEntity(publisher, this._publishers, false);
  }

  /**
   * Destroy a Subscription.
   * @param {Subscription} subscription - The Subscription to be destroyed.
   * @return {undefined}
   */
  destroySubscription(subscription) {
    if (!(subscription instanceof Subscription)) {
      throw new TypeError('Invalid argument');
    }
    this._destroyEntity(subscription, this._subscriptions);
  }

  /**
   * Destroy a Client.
   * @param {Client} client - The Client to be destroyed.
   * @return {undefined}
   */
  destroyClient(client) {
    if (!(client instanceof Client)) {
      throw new TypeError('Invalid argument');
    }
    this._destroyEntity(client, this._clients);
  }

  /**
   * Destroy a Service.
   * @param {Service} service - The Service to be destroyed.
   * @return {undefined}
   */
  destroyService(service) {
    if (!(service instanceof Service)) {
      throw new TypeError('Invalid argument');
    }
    this._destroyEntity(service, this._services);
  }

  /**
   * Destroy a Timer.
   * @param {Timer} timer - The Timer to be destroyed.
   * @return {undefined}
   */
  destroyTimer(timer) {
    if (!(timer instanceof Timer)) {
      throw new TypeError('Invalid argument');
    }
    this._destroyEntity(timer, this._timers);
  }

  /* Get the name of the node.
   * @return {string}
   */
  name() {
    return rclnodejs.getNodeName(this.handle);
  }

  /* Get the namespace of the node.
   * @return {string}
   */
  namespace() {
    return rclnodejs.getNamespace(this.handle);
  }

  /**
   * Get the list of published topics discovered by the provided node for the remote node name.
   * @param {string} nodeName - The name of the node.
   * @param {string} namespace - The name of the namespace.
   * @param {boolean} noDemangle - If true topic names and types returned will not be demangled, default: false.
   * @return {array} - An array of the names and types.
   */
  getPublisherNamesAndTypesByNode(nodeName, namespace, noDemangle = false) {
    return rclnodejs.getPublisherNamesAndTypesByNode(this.handle, nodeName, namespace, noDemangle);
  }

  /**
   * Get the list of published topics discovered by the provided node for the remote node name.
   * @param {string} nodeName - The name of the node.
   * @param {string} namespace - The name of the namespace.
   * @param {boolean} noDemangle - If true topic names and types returned will not be demangled, default: false.
   * @return {array} - An array of the names and types.
   */
  getSubscriptionNamesAndTypesByNode(nodeName, namespace, noDemangle = false) {
    return rclnodejs.getSubscriptionNamesAndTypesByNode(this.handle, nodeName, namespace, noDemangle);
  }

  /**
   * Get the list of service topics discovered by the provided node for the remote node name.
   * @param {string} nodeName - The name of the node.
   * @param {string} namespace - The name of the namespace.
   * @return {array} - An array of the names and types.
   */
  getServiceNamesAndTypesByNode(nodeName, namespace) {
    return rclnodejs.getServiceNamesAndTypesByNode(this.handle, nodeName, namespace);
  }

  /**
   * Get the list of topics discovered by the provided node.
   * @param {boolean} noDemangle - If true topic names and types returned will not be demangled, default: false.
   * @return {array} - An array of the names and types.
   */
  getTopicNamesAndTypes(noDemangle = false) {
    return rclnodejs.getTopicNamesAndTypes(this.handle, noDemangle);
  }

  /**
   * Get the list of services discovered by the provided node.
   * @return {array} - An array of the names and types.
   */
  getServiceNamesAndTypes() {
    return rclnodejs.getServiceNamesAndTypes(this.handle);
  }
}

module.exports = Node;
