@echo off
REM ================================================================
REM  push.bat - Push seguro a CoroPacemDeusPSF/ParroquiaSagradaFamilia
REM
REM  Verifica antes de pushear:
REM    1. Carpeta correcta
REM    2. Es repo git
REM    3. Remote apunta a CoroPacemDeusPSF/ParroquiaSagradaFamilia
REM    4. user.name = CoroPacemDeusPSF
REM    5. Rama = main
REM
REM  Si cualquier verificacion falla, aborta sin tocar nada.
REM
REM  Uso:
REM    push.bat "mensaje del commit"
REM    push.bat                          (te pregunta el mensaje)
REM ================================================================

setlocal EnableDelayedExpansion

set EXPECTED_REPO_PATH=C:\tmp\ParroquiaSagradaFamilia
set EXPECTED_USER=CoroPacemDeusPSF
set EXPECTED_REMOTE=https://CoroPacemDeusPSF@github.com/CoroPacemDeusPSF/ParroquiaSagradaFamilia.git
set EXPECTED_BRANCH=main

echo.
echo ========================================
echo   PUSH SEGURO - Pacem Deus
echo ========================================
echo.

cd /d "%EXPECTED_REPO_PATH%"
if errorlevel 1 (
  echo [ERROR] No se pudo entrar a %EXPECTED_REPO_PATH%
  exit /b 1
)
echo [OK]  Carpeta: %CD%

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo [ERROR] No es un repositorio git
  exit /b 1
)

for /f "delims=" %%R in ('git remote get-url origin 2^>nul') do set CURRENT_REMOTE=%%R
if not "!CURRENT_REMOTE!"=="%EXPECTED_REMOTE%" (
  echo [ERROR] Remote incorrecto:
  echo         Esperado: %EXPECTED_REMOTE%
  echo         Actual:   !CURRENT_REMOTE!
  echo.
  echo Para corregir:
  echo   git remote set-url origin %EXPECTED_REMOTE%
  exit /b 1
)
echo [OK]  Remote:  !CURRENT_REMOTE!

for /f "delims=" %%U in ('git config user.name') do set CURRENT_USER=%%U
if not "!CURRENT_USER!"=="%EXPECTED_USER%" (
  echo [ERROR] user.name incorrecto:
  echo         Esperado: %EXPECTED_USER%
  echo         Actual:   !CURRENT_USER!
  exit /b 1
)
echo [OK]  Usuario: !CURRENT_USER!

for /f "delims=" %%B in ('git branch --show-current') do set CURRENT_BRANCH=%%B
if not "!CURRENT_BRANCH!"=="%EXPECTED_BRANCH%" (
  echo [ERROR] Rama incorrecta:
  echo         Esperado: %EXPECTED_BRANCH%
  echo         Actual:   !CURRENT_BRANCH!
  exit /b 1
)
echo [OK]  Rama:    !CURRENT_BRANCH!

echo.
echo --- Cambios a publicar ---
git status --short
echo.

set COMMIT_MSG=%~1
if "!COMMIT_MSG!"=="" (
  set /p COMMIT_MSG=Mensaje del commit: 
)
if "!COMMIT_MSG!"=="" (
  echo [ERROR] Mensaje vacio. Aborto.
  exit /b 1
)

echo.
echo Mensaje: "!COMMIT_MSG!"
set /p CONFIRM=Continuar con commit y push? (s/n): 
if /i not "!CONFIRM!"=="s" (
  echo Cancelado.
  exit /b 0
)

echo.
git add .
git commit -m "!COMMIT_MSG!"
if errorlevel 1 (
  echo [INFO] Nada que commitear o commit fallido. Intentando push de todos modos...
)
git push
if errorlevel 1 (
  echo [ERROR] push fallido
  exit /b 1
)

echo.
echo ========================================
echo   PUSH EXITOSO
echo ========================================
endlocal