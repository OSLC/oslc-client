/*
 * Copyright 2014 IBM Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

 'use strict';

// This module is the entry point for the OSLC Client library.
// It exports the server module, which is the main module of the library.
// This is what is imported when the module is required.
export { default as OSLCClient } from './OSLCClient.js';
export { default } from './OSLCClient.js';
export { default as LDMClient } from './LDMClient.js';
// The hard-coded half of the OSLC Linking Profiles "Link Ownership" table, for providers that
// cannot declare ownership in their own shapes. Clients filter drop targets with it.
export { INVERSE_LINK_TYPES } from './LDMClient.js';
// Pure data, no dependencies — importable on its own by clients that want only the table.
export { LINK_PROFILE, LINK_OWNER_DOMAIN, BUILTIN_INVERSE_LABELS, DOMAIN } from './link-profile.js';
export { OSLCError, PreconditionFailedError, ConflictError, CredentialRejectedError, oslcErrorFrom } from './errors.js';
export { default as OSLCResource } from './OSLCResource.js';
export { default as ServiceProvider } from './ServiceProvider.js';
export { default as Compact } from './Compact.js';
