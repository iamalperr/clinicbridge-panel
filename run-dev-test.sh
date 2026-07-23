#!/bin/bash
npm run dev &
DEV_PID=$!
sleep 15
node test-local.ts
kill $DEV_PID
