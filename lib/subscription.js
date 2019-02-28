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
const Entity = require('./entity.js');
const debug = require('debug')('rclnodejs:subscription');

const translator = require('../rosidl_gen/message_translator.js');



function toPlainObject(message, msg_data, enableTypedArray = true) {
  if (!message) return undefined;

  // TODO(Kenny): make sure `message` is a ROS message

  if (message.constructor.isROSArray) {
    // It's a ROS message array
    //  Note: there won't be any JavaScript array in message
    let array = [];
    msg_data.data.forEach((e) => {
      array.push(toPlainObject(message.data[0],e, enableTypedArray));  // Translate every elements
    });
    return array;
    // eslint-disable-next-line no-else-return
  } else {
    // It's a ROS message
    const def = message.constructor.ROSMessageDef;
    let obj = {};
    for (let i in def.fields) {
      const name = def.fields[i].name;
      if (def.fields[i].type.isPrimitiveType) {
        if (def.fields[i].type.isArray &&
            message._wrapperFields[name].constructor.useTypedArray &&
            !enableTypedArray) {
          obj[name] = Array.from(msg_data[name]);
        } else {
          // Direct assignment
          //  Note: TypedArray also falls into this branch if |enableTypedArray| is true
          // TODO(Kenny): make sure Int64 & Uint64 type can be copied here
        if(msg_data[name].hasOwnProperty("ref.buffer")) {
             obj[name]=msg_data[name]["data"];
          }else {
            obj[name] = msg_data[name];
          }
        }
      } else {
        // Proceed further
        obj[name] = toPlainObject(message[name],msg_data[name], enableTypedArray);
      }
    }
    return obj;
  }
}


/**
 * @class - Class representing a Subscription in ROS
 * @hideconstructor
 */

class Subscription extends Entity {
  constructor(handle, nodeHandle, typeClass, topic, callback, qos) {
    super(handle, typeClass, qos);
    this._topic = topic;
    this._callback = callback;
    this._message = new typeClass();
    this["clazz"] = typeClass;
  }

  processResponse(msg) {
    //this._message.deserialize(msg);
    //console.log("======================================");
    //console.log(this._message);
    //msg._dataIntialized = true;
    debug(`Message of topic ${this._topic} received.`);
    //this._callback(this._message.toPlainObject());
    this._callback(toPlainObject(this._message,msg));
    /*
    if(this["clazz"].isPrimitive()) {
      this["clazz"].destoryRawROS(this._message);
    } 
    */
  }

  static createSubscription(nodeHandle, typeClass, topic, callback, qos) {
    let type = typeClass.type();
    let handle = rclnodejs.createSubscription(nodeHandle, type.pkgName, type.subFolder, type.interfaceName, topic, qos);
    return new Subscription(handle, nodeHandle, typeClass, topic, callback, qos);
  }

  /**
   * @type {string}
   */
  get topic() {
    return this._topic;
  }
};

module.exports = Subscription;
