@echo off



setlocal EnableExtensions







pushd "%~dp0" >nul 2>nul



if errorlevel 1 (



  echo [ERROR] Failed to enter script directory: %~dp0



  goto :fail_hold



)







set "TARGET_CONDA_ENV=E:\conda\envs\lianghua"



set "TARGET_CONDA_BAT=E:\conda\condabin\conda.bat"







set "MODE=%~1"



if "%MODE%"=="" goto :main



if /I "%MODE%"=="backend" goto :backend

if /I "%MODE%"=="frontend" goto :frontend

if /I "%MODE%"=="qmt" goto :qmt

if /I "%MODE%"=="market" goto :market

if /I "%MODE%"=="help" goto :usage

echo [ERROR] Unknown mode: %MODE%
goto :usage

:qmt


echo [WARN][QMT] qmt_api_service merged into unified_api (http://127.0.0.1:8080/qmt).

echo [WARN][QMT] Please run "start_all.bat backend" instead.

goto :exit_ok




:main



echo [INFO] Starting unified backend and frontend in separate windows...



start "Quant Unified API" cmd /k ""%~f0" backend"



if errorlevel 1 (



  echo [ERROR] Failed to create backend window.



  goto :fail_hold



)







timeout /t 2 /nobreak >nul







start "Quant WebUI - pnpm dev" cmd /k ""%~f0" frontend"



if errorlevel 1 (



  echo [ERROR] Failed to create frontend window.



  goto :fail_hold



)







echo.



echo [INFO] All services were started.



echo [INFO] Unified API URL:  http://127.0.0.1:8080   (含 /market 与 /qmt 路由)



echo [INFO] WebUI URL:        http://localhost:3000



echo [INFO] Close each service window to stop it.



goto :exit_ok







:backend



call :activate_conda_env



if errorlevel 1 goto :fail_hold







call :resolve_python



if errorlevel 1 goto :fail_hold







echo [INFO][Backend] Using Python: %PY_CMD%



if not exist "services\\unified_api.py" (



  echo [ERROR][Backend] services\\unified_api.py not found under: %CD%



  goto :fail_hold



)







echo [INFO][Backend] Checking Python dependencies...



"%PY_CMD%" -c "import fastapi,uvicorn,jose,passlib" >nul 2>nul



if errorlevel 1 (



  echo [WARN][Backend] Missing dependencies. Installing minimal Web API packages...



  echo [INFO][Backend] Command:



  echo   "%PY_CMD%" -m pip install fastapi uvicorn[standard] python-jose[cryptography] passlib[bcrypt]



  "%PY_CMD%" -m pip install fastapi uvicorn[standard] python-jose[cryptography] passlib[bcrypt]



  if errorlevel 1 (



    echo [ERROR][Backend] Dependency installation failed.



    goto :fail_hold



  )



)







echo [INFO][Backend] Starting services\\unified_api.py ...



"%PY_CMD%" services\\unified_api.py



set "ERR=%ERRORLEVEL%"



if not "%ERR%"=="0" (



  echo [ERROR][Backend] web_api.py exited with code %ERR%.



  goto :fail_hold



)







goto :exit_ok







:market


echo [WARN][Market] market_data_api merged into unified_api (http://127.0.0.1:8080/market).

echo [WARN][Market] Please run "start_all.bat backend" instead.

goto :exit_ok




:frontend



call :activate_conda_env



if errorlevel 1 goto :fail_hold







call :resolve_pnpm



if errorlevel 1 goto :fail_hold







echo [INFO][Frontend] Using package runner: %PNPM_DESC%



if not exist "webui\package.json" (



  echo [ERROR][Frontend] webui\package.json not found under: %CD%



  goto :fail_hold



)







if not exist "webui\node_modules" (



  echo [WARN][Frontend] node_modules missing. Installing dependencies...



  call :pnpm_run -C webui install



  if errorlevel 1 (



    echo [ERROR][Frontend] Dependency installation failed.



    goto :fail_hold



  )



)







echo [INFO][Frontend] Starting dev server...



call :pnpm_run -C webui dev



set "ERR=%ERRORLEVEL%"



if not "%ERR%"=="0" (



  echo [ERROR][Frontend] Dev server exited with code %ERR%.



  goto :fail_hold



)







goto :exit_ok







:activate_conda_env



if /I "%CONDA_PREFIX%"=="%TARGET_CONDA_ENV%" (



  echo [INFO] Conda env already active: %CONDA_PREFIX%



  exit /b 0



)







if exist "%TARGET_CONDA_BAT%" (



  echo [INFO] Activating conda env: %TARGET_CONDA_ENV%



  call "%TARGET_CONDA_BAT%" activate "%TARGET_CONDA_ENV%"



  if errorlevel 1 (



    echo [ERROR] Failed to activate conda env via "%TARGET_CONDA_BAT%".



    exit /b 1



  )



) else (



  where conda >nul 2>nul



  if errorlevel 1 (



    echo [ERROR] Conda activation script not found.



    echo [ERROR] Checked:



    echo [ERROR]   1^) %TARGET_CONDA_BAT%



    echo [ERROR]   2^) PATH ^(conda^)



    exit /b 1



  )







  echo [INFO] Activating conda env via PATH conda: %TARGET_CONDA_ENV%



  call conda activate "%TARGET_CONDA_ENV%"



  if errorlevel 1 (



    echo [ERROR] Failed to activate conda env via PATH conda.



    exit /b 1



  )



)







if /I not "%CONDA_PREFIX%"=="%TARGET_CONDA_ENV%" (



  echo [WARN] Conda activation returned without target prefix.



  echo [WARN] Current CONDA_PREFIX=%CONDA_PREFIX%



  echo [WARN] Target  CONDA_PREFIX=%TARGET_CONDA_ENV%



)







exit /b 0







:resolve_python



set "PY_CMD="



where python >nul 2>nul



if not errorlevel 1 (



  set "PY_CMD=python"



  goto :eof



)







if exist ".venv\Scripts\python.exe" (



  set "PY_CMD=%CD%\.venv\Scripts\python.exe"



  goto :eof



)







echo [ERROR] Python not found. Checked:



echo   1^) PATH ^(python^)



echo   2^) .venv\Scripts\python.exe



exit /b 1







:resolve_pnpm



set "PNPM_MODE="



set "PNPM_DESC="



where pnpm >nul 2>nul



if not errorlevel 1 (



  set "PNPM_MODE=pnpm"



  set "PNPM_DESC=pnpm"



  goto :eof



)







where corepack >nul 2>nul



if not errorlevel 1 (



  set "PNPM_MODE=corepack"



  set "PNPM_DESC=corepack pnpm"



  goto :eof



)







echo [ERROR] pnpm not found. Checked:



echo   1^) PATH ^(pnpm^)



echo   2^) corepack pnpm



exit /b 1







:pnpm_run



if /I "%PNPM_MODE%"=="pnpm" (



  pnpm %*



  exit /b %ERRORLEVEL%



)



if /I "%PNPM_MODE%"=="corepack" (



  corepack pnpm %*



  exit /b %ERRORLEVEL%



)







echo [ERROR] Internal error: PNPM_MODE is not resolved.



exit /b 1







:usage



echo.



echo Usage:

echo   start_all.bat            ^(start backend + market + frontend^)

echo   start_all.bat backend    ^(start backend only^)

echo   start_all.bat frontend   ^(start frontend only^)

echo   start_all.bat market     ^(start market data API only^)

echo.



if /I "%MODE%"=="help" goto :exit_ok



goto :fail_hold







:fail_hold



echo.



echo [ERROR] Startup aborted.



echo Press any key to close this window...



pause >nul



goto :exit_fail







:exit_ok



popd >nul 2>nul



endlocal



exit /b 0







:exit_fail



popd >nul 2>nul



endlocal



exit /b 1



