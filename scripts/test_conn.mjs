import postgres from 'postgres';

const projectRef = 'kaxwuclrddyeetflneil';
const password = encodeURIComponent('LEfjsv@1/letra');
const connectionString = `postgresql://postgres.${projectRef}:${password}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;

const sql = postgres(connectionString);

async function testConn() {
    try {
        const res = await sql`SELECT now()`;
        console.log('Connection OK:', res);
    } catch (error) {
        console.error('Connection Failed:', error);
    } finally {
        await sql.end();
    }
}

testConn();
