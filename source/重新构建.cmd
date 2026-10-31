@echo off
cd /d "%~dp0"
node build-offline.mjs --output ../resources/app/index.html --storage-key map-design-portable-v1
pause
