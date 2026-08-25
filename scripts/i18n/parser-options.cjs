const path = require('node:path');

const BASE_PLUGINS = ['typescript', 'decorators-legacy', 'classProperties'];

function parserPlugins(filePath) {
	return path.extname(filePath) === '.ts'
		? BASE_PLUGINS
		: ['jsx', ...BASE_PLUGINS];
}

module.exports = { parserPlugins };
