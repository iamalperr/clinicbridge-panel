import * as xlsx from 'xlsx';

function analyzeFile(filePath: string) {
  const workbook = xlsx.readFile(filePath);
  
  console.log(`Sheet Names: ${workbook.SheetNames.join(', ')}\n`);
  
  for (const sheetName of workbook.SheetNames) {
    if (sheetName === 'Export Summary') continue;
    
    console.log(`--- Sheet: ${sheetName} ---`);
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    
    const usedRows = data.filter((row: any) => row.length > 0 && row.some((cell: any) => cell !== undefined && cell !== null && cell !== ''));
    console.log(`Total Rows: ${data.length}`);
    console.log(`Used Rows: ${usedRows.length}`);
    console.log(`Empty Rows: ${data.length - usedRows.length}`);
    
    // Output first 25 rows for inspection
    console.log('First 25 used rows:');
    for (let i = 0; i < Math.min(25, usedRows.length); i++) {
      console.log(`[${i+1}] ${JSON.stringify(usedRows[i])}`);
    }
    
    console.log('\n');
  }
}

analyzeFile('./data/imports/feelinhealthy/TEDAVI-BASLIKLARI.xlsx');
