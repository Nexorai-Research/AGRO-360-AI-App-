const expo = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier/flat');

module.exports = [
  ...expo,
  prettier,
  { ignores: ['.claude/*', 'dist/*', '.expo/*', 'node_modules/*', 'src/api/schema.d.ts', 'scripts/*'] },
];
