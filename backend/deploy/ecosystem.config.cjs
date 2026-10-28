// PM2 is an optional operator-installed supervisor, not an application dependency.
// Supply secrets through the hosting environment or secret manager.
const cwd=require("node:path").resolve(__dirname,"..");
module.exports = {
  apps: [
    {cwd,name:"medreach-api",script:"src/server.js",instances:2,exec_mode:"cluster",kill_timeout:30000,listen_timeout:15000,env:{NODE_ENV:"production"}},
    {cwd,name:"medreach-notification",script:"src/workers/notification.js",instances:1,exec_mode:"fork",kill_timeout:35000,env:{NODE_ENV:"production"}},
    {cwd,name:"medreach-expiry",script:"src/workers/expiry.js",instances:1,exec_mode:"fork",kill_timeout:35000,env:{NODE_ENV:"production"}},
    {cwd,name:"medreach-recovery",script:"src/workers/recovery.js",instances:1,exec_mode:"fork",kill_timeout:35000,env:{NODE_ENV:"production"}},
  ],
};
