import postgres from 'postgres';
import fs from 'fs';
import path from 'path';

const sql = postgres('postgresql://postgres.kaxwuclrfmqllyogresler:AppPF2026_@aws-0-us-west-1.pooler.supabase.com:6543/postgres');

async function runMigration() {
    try {
        const migrationPath = path.resolve('supabase/migrations/20260308000000_finance_module.sql');
        const migrationSql = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('Applying migration...');
        await sql.unsafe(migrationSql);
        console.log('Migration applied successfully!');
    } catch (error) {
        console.error('Error applying migration:', error);
    } finally {
        await sql.end();
    }
}

runMigration();
