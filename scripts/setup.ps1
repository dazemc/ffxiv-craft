Set-Location -Path $PSScriptRoot
cd ../
git submodule update --init --recursive
cd ./scripts/craft-data
git fetch origin
git checkout main
git pull origin main
exit
