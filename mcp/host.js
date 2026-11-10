#!/usr/bin/env node
// Started by the browser (native messaging) when the Caderno+ extension turns the ponte on: relays between the extension
// and the Caderno+ MCP server on a local socket. Not meant to be run by hand.
"use strict";
require("./ponte").host();
