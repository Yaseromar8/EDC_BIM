const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'frontend-react', 'src');

const regex = /const BACKEND_URL = \(typeof window !== 'undefined'[\s\S]*?\);/g;

const replacement = "const BACKEND_URL = (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ? 'https://visor-ecd-backend.onrender.com' : (import.meta.env.VITE_BACKEND_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3000' : (typeof window !== 'undefined' && window.location.hostname.match(/^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$/) ? http://\:3000 : 'https://visor-ecd-backend.onrender.com')));";

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDir(fullPath);
        } else if (fullPath.endsWith('.jsx') || fullPath.endsWith('.js')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;
            
            if (regex.test(content)) {
                content = content.replace(regex, replacement);
                modified = true;
            }
            
            if (modified) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log('Fixed for prod:', fullPath);
            }
        }
    }
}

processDir(srcDir);
