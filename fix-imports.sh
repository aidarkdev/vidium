#!/usr/bin/env bash
# Fix all relative imports to use .ts extensions.
# Run from project root: bash fix-imports.sh
set -e

cd "$(dirname "$0")"

# Step 1: change .js → .ts in imports
find src scripts -name '*.ts' -exec sed -i "s/from '\(.*\)\.js'/from '\1.ts'/g" {} +

# Step 2: add .ts to extensionless relative imports
# Matches lines like: from './foo'  or  from '../foo/bar'
# but NOT lines already ending in .ts'
find src scripts -name '*.ts' -exec perl -pi -e "s/from '(\.\.?\/[^']+?)(?<!\.ts)'/from '\$1.ts'/g" {} +

# Verify
echo "=== Remaining extensionless imports (should be empty): ==="
grep -rn "from '\.\." src/ scripts/ | grep -v "\.ts'" || echo "(none — all good)"
grep -rn "from '\./" src/ scripts/ | grep -v "\.ts'" || echo "(none — all good)"
