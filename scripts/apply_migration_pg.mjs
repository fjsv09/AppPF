import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;

const connectionString = 'postgresql://postgres.kaxwuclrfmqllyogresler:AppPF2026_@aws-0-us-west-1.pooler.supabase.com:6543/postgres';

async function run() {
    const client = new Client({ connectionString });
    try {
        await client.connect();
        console.log('Connected!');
        
        const migrationPath = path.resolve('supabase/migrations/20260308000000_finance_module.sql');
        const migrationSql = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('Executing migration...');
        await client.query(migrationSql);
        console.log('DONE!');
    } catch (err) {
        console.error('FAILED:', err);
    } finally {
        await client.end();
    }
}

run();
