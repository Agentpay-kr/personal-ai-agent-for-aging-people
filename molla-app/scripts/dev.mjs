import { spawn } from 'node:child_process';
const children = [spawn(process.execPath, ['--env-file-if-exists=.env','server/index.mjs'], {stdio:'inherit'}), spawn(process.execPath, ['node_modules/vite/bin/vite.js','--host','127.0.0.1'], {stdio:'inherit'})];
function stop(){ for(const child of children) child.kill(); }
process.on('SIGINT',stop); process.on('SIGTERM',stop);
for(const child of children) child.on('exit',code=>{ if(code) {stop(); process.exit(code);} });
