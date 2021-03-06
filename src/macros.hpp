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

#ifndef RCLNODEJS_MARCOS_HPP_
#define RCLNODEJS_MARCOS_HPP_

#define CHECK_OP_AND_THROW_ERROR_IF_NOT_TRUE(op, lhs, rhs, message) \
  { \
    if (lhs op rhs) { \
      Nan::ThrowError(message); \
      rcl_reset_error(); \
      info.GetReturnValue().Set(Nan::Undefined()); \
      return; \
    } \
  } \

#define THROW_ERROR_IF_NOT_EQUAL(lhs, rhs, message) \
  CHECK_OP_AND_THROW_ERROR_IF_NOT_TRUE(!=, lhs, rhs, message)

#define THROW_ERROR_IF_EQUAL(lhs, rhs, message) \
  CHECK_OP_AND_THROW_ERROR_IF_NOT_TRUE(==, lhs, rhs, message)

#endif
