@echo off
chcp 65001 >nul
set "studyFolder=%~dp0..\explore-shoot-学习笔记"
if not exist "%studyFolder%\" (
  echo 未找到本地学习资料文件夹：
  echo %studyFolder%
  echo 学习资料只保存在你的电脑，不随 GitHub 仓库下载。
  pause
  exit /b 1
)
start "" "%studyFolder%"
