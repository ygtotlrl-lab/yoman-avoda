@echo off
REM Re-sign an APK with the PERMANENT yoman-avoda key (signing\yoman.keystore).
REM Requires Android build-tools on PATH (zipalign + apksigner).
REM Usage: sign-apk.bat <unsigned.apk> [output.apk]
setlocal
set KS=%~dp0yoman.keystore
set IN=%~1
set OUT=%~2
if "%OUT%"=="" set OUT=yoman-signed.apk
if "%IN%"=="" (echo usage: sign-apk.bat ^<unsigned.apk^> [output.apk] & exit /b 1)

zipalign -p -f 4 "%IN%" "%OUT%-aligned.apk"
apksigner sign --ks "%KS%" --ks-key-alias yoman --ks-pass pass:yoman123 --key-pass pass:yoman123 --out "%OUT%" "%OUT%-aligned.apk"
del "%OUT%-aligned.apk"
apksigner verify --print-certs "%OUT%"
echo Signed with permanent key -^> %OUT%
endlocal
