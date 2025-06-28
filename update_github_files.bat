@echo off
cd /d E:\123HANDLELISTE

echo Adding all changes...
git add .

echo Committing...
git commit -m "Update site"

echo Pushing to GitHub...
git push

echo Done. Your site will be redeployed by Render shortly.
pause
