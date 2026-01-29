const fs = require('node:fs');
const path = require('node:path');

function validateJsonFile(filePath) {
    console.log(`\n🔍 Validating: ${filePath}`);

    try {
        const rawContent = fs.readFileSync(filePath, 'utf8');
        JSON.parse(rawContent);
        console.log(`✅ Valid JSON`);
        return true;
    } catch (error) {
        console.error(`\n❌ INVALID JSON`);
        console.error(`Error: ${error.message}\n`);

        const rawContent = fs.readFileSync(filePath, 'utf8');
        const lines = rawContent.split('\n');

        const posMatch = error.message.match(/position (\d+)/);
        if (posMatch) {
            const position = parseInt(posMatch[1]);
            let currentPos = 0;
            let errorLine = 0;
            let errorCol = 0;

            for (let i = 0; i < lines.length; i++) {
                const lineLength = lines[i].length + 1;
                if (currentPos + lineLength > position) {
                    errorLine = i + 1;
                    errorCol = position - currentPos;
                    break;
                }
                currentPos += lineLength;
            }

            console.error(`📍 Error at Line ${errorLine}, Column ${errorCol}\n`);

            const contextStart = Math.max(0, errorLine - 5);
            const contextEnd = Math.min(lines.length, errorLine + 4);

            console.error('─'.repeat(80));
            for (let i = contextStart; i < contextEnd; i++) {
                const lineNum = (i + 1).toString().padStart(5, ' ');
                const marker = (i === errorLine - 1) ? '→' : ' ';
                const line = lines[i];
                console.error(`${marker} ${lineNum} │ ${line}`);

                if (i === errorLine - 1 && errorCol > 0) {
                    const spaces = ' '.repeat(9 + errorCol);
                    console.error(`  ${spaces}↑ ERROR HERE`);
                }
            }
            console.error('─'.repeat(80));
        }

        console.error('\n🔧 Possible fixes:');
        if (error.message.includes('Unexpected token')) {
            const token = error.message.match(/Unexpected token '(.+?)'/)?.[1];
            if (token === ',' || token === '}' || token === ']') {
                console.error('   • Remove trailing comma before closing bracket/brace');
            }
            console.error('   • Check for missing or extra commas');
            console.error('   • Verify all brackets/braces are properly closed');
        }
        if (error.message.includes('Unexpected end')) {
            console.error('   • Missing closing bracket } or ]');
            console.error('   • Unclosed string');
        }

        console.error('');
        return false;
    }
}

function validateAllLocales() {
    const translationsDir = path.join(__dirname, '../../translations');
    const configFile = path.join(translationsDir, 'languages.config.json');

    if (!fs.existsSync(configFile)) {
        console.error('❌ languages.config.json not found');
        return;
    }

    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    let valid = 0;
    let invalid = 0;
    const invalidFiles = [];

    console.log('🔍 Validating locale files...\n');

    for (const lang of config.languages) {
        const filePath = path.join(translationsDir, lang.filePath);

        if (!fs.existsSync(filePath)) {
            console.warn(`⚠️  ${lang.filePath} not found, skipping`);
            continue;
        }

        if (validateJsonFile(filePath)) {
            valid++;
        } else {
            invalid++;
            invalidFiles.push({ name: lang.name, path: lang.filePath });
        }
    }

    console.log('\n' + '═'.repeat(80));
    console.log('📊 Validation Summary:');
    console.log(`   ✅ Valid files:   ${valid}`);
    console.log(`   ❌ Invalid files: ${invalid}`);

    if (invalidFiles.length > 0) {
        console.log('\n❌ Files with errors:');
        invalidFiles.forEach(f => console.log(`   • ${f.name}: ${f.path}`));
    }
    console.log('═'.repeat(80));
}

if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length > 0) {
        validateJsonFile(args[0]);
    } else {
        validateAllLocales();
    }
}

module.exports = { validateJsonFile, validateAllLocales };