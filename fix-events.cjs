const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

let modifiedFiles = 0;

walkDir('./src', function(filePath) {
  if (filePath.endsWith('.svelte')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // 1. Remove the completely invalid bubble() calls
    content = content.replace(/onclick=\{stopPropagation\(bubble\(['"]click['"]\)\)\}/g, 'onclick={(e) => e.stopPropagation()}');
    content = content.replace(/onclick=\{stopPropagation\(bubble\(['"]click['"]\)\)\s*\}/g, 'onclick={(e) => e.stopPropagation()}');
    content = content.replace(/onkeydown=\{stopPropagation\(bubble\(['"]keydown['"]\)\)\}/g, 'onkeydown={(e) => e.stopPropagation()}');
    content = content.replace(/onclick=\{stopPropagation\(bubble\(['"]click['"]\)\)\} /g, 'onclick={(e) => e.stopPropagation()} ');

    // 2. Check if there are loose stopPropagation( or preventDefault( calls
    // Negative lookbehind for dot `.` is not uniformly supported in old JS, but we can do a simpler replace.
    // Let's just match `{preventDefault(` or `{stopPropagation(` or `=preventDefault(`
    let needsPreventDefault = /\{(?:\s*)preventDefault\(/.test(content) || /=(?:\s*)preventDefault\(/.test(content);
    let needsStopProp = /\{(?:\s*)stopPropagation\(/.test(content) || /=(?:\s*)stopPropagation\(/.test(content);

    if (needsPreventDefault || needsStopProp) {
      let importsToAdd = [];
      if (needsPreventDefault && !content.includes('preventDefault } from \'svelte/legacy\'') && !content.includes('preventDefault} from \'svelte/legacy\'') && !content.includes('preventDefault } from "svelte/legacy"')) {
        importsToAdd.push('preventDefault');
      }
      if (needsStopProp && !content.includes('stopPropagation } from \'svelte/legacy\'') && !content.includes('stopPropagation} from \'svelte/legacy\'') && !content.includes('stopPropagation } from "svelte/legacy"')) {
        importsToAdd.push('stopPropagation');
      }

      if (importsToAdd.length > 0) {
        let importStmt = `\n  import { ${importsToAdd.join(', ')} } from 'svelte/legacy';`;
        
        // Inject into <script lang="ts"> or <script>
        if (content.includes('<script lang="ts">')) {
          content = content.replace('<script lang="ts">', `<script lang="ts">${importStmt}`);
        } else if (content.includes('<script>')) {
          content = content.replace('<script>', `<script>${importStmt}`);
        } else {
          // If no script tag exists at all
          content = `<script lang="ts">${importStmt}\n</script>\n\n` + content;
        }
      }
    }

    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Fixed:', Math.abs(content.length - original.length), 'bytes in', filePath);
      modifiedFiles++;
    }
  }
});

console.log(`\nSuccessfully fixed ${modifiedFiles} files.`);
