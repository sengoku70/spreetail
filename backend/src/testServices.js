import { parseCSV, parseDate, parseSplitDetails, parseSplitWith } from './services/importService.js';

const sampleCSVData = `date,description,paid_by,amount,currency,split_type,split_with,split_details,notes
2026-02-01,February rent,Aisha,48000,INR,equal,"Aisha;Rohan;Priya;Meera",,
14/03/2026,Groceries DMart,Priya S,1875,INR,equal,"Aisha;Rohan;Priya;Meera",,
Mar 14,dinner - marina bites,Rohan ,450,INR,equal,"Aisha;Rohan",,
2026-03-14,Dinner at Marina Bites,rohan,450,INR,equal,"Aisha;Rohan",,
15/03/2026,Pizza Friday,Aisha,1440,INR,percentage,"Aisha;Rohan;Priya;Meera","Aisha 30%; Rohan 30%; Priya 30%; Meera 20%",
22/03/2026,Goa Taxi,Dev,90,USD,share,"Aisha;Rohan;Priya;Dev","Aisha 2; Rohan 1; Priya 1; Dev 1",
23/03/2026,Goa Thalassa Dinner,Priya,2400,INR,equal,"Aisha;Rohan;Priya;Dev;Kabir",,
24/03/2026,Parasailing refund,Dev,-30,USD,equal,"Aisha;Rohan;Priya;Dev",,
27/03/2026,Ambiguous Date,Priya, 1450 ,INR,equal,"Aisha;Rohan",,
04/05/2026,Late Grocery,Rohan,800,INR,equal,"Aisha;Rohan",,
02/04/2026,April dinner,Aisha,1500,INR,equal,"Aisha;Rohan;Priya;Meera;Sam",,
`;

function testParser() {
  console.log('--- Testing CSV Parser ---');
  const rows = parseCSV(sampleCSVData);
  console.log(`Parsed ${rows.length} rows.`);
  
  if (rows.length > 0) {
    console.log('✔ CSV parsing test passed');
  } else {
    console.error('❌ CSV parsing test failed');
  }
}

function testDateParser() {
  console.log('\n--- Testing Date Parser ---');
  
  const d1 = parseDate('14/03/2026');
  console.log('14/03/2026 ->', d1.normalizedStr, `Ambiguous: ${d1.isAmbiguous}`);
  
  const d2 = parseDate('Mar 14');
  console.log('Mar 14 ->', d2.normalizedStr, `Ambiguous: ${d2.isAmbiguous}`);

  const d3 = parseDate('04/05/2026');
  console.log('04/05/2026 ->', d3.normalizedStr, `Ambiguous: ${d3.isAmbiguous}`);

  if (d1.normalizedStr === '2026-03-14' && d2.normalizedStr === '2026-03-14' && d3.normalizedStr === '2026-05-04') {
    console.log('✔ Date parser tests passed (DD/MM/YYYY took precedence)');
  } else {
    console.error('❌ Date parser tests failed');
  }
}

function testSplitParser() {
  console.log('\n--- Testing Splits Parsing ---');
  
  const details = "Aisha 30%; Rohan 30%; Priya 30%; Meera 20%";
  const parsed = parseSplitDetails(details);
  console.log('Parsed details:', parsed);
  
  if (parsed.length === 4 && parsed[0].name === 'Aisha' && parsed[0].value === 30) {
    console.log('✔ Splits details parsing test passed');
  } else {
    console.error('❌ Splits details parsing test failed');
  }

  const splitWithList = "Aisha;Rohan;Priya;Meera";
  const parsedWith = parseSplitWith(splitWithList);
  console.log('Parsed split_with:', parsedWith);
  if (parsedWith.length === 4 && parsedWith[0].name === 'Aisha' && parsedWith[0].value === null) {
    console.log('✔ Split_with list parsing test passed');
  } else {
    console.error('❌ Split_with list parsing test failed');
  }
}

function testCashFlowMinimizer() {
  console.log('\n--- Testing Cash Flow Minimizer Algorithm ---');

  const mockDebts = [
    { name: 'Aisha', balance: 500 },
    { name: 'Rohan', balance: -200 },
    { name: 'Priya', balance: -300 },
    { name: 'Meera', balance: 0 }
  ];

  const recommendations = [];
  const tolerance = 0.05;

  while (true) {
    mockDebts.sort((a, b) => a.balance - b.balance);
    const debtor = mockDebts[0];
    const creditor = mockDebts[mockDebts.length - 1];

    if (Math.abs(debtor.balance) < tolerance && Math.abs(creditor.balance) < tolerance) {
      break;
    }

    const amount = Math.min(Math.abs(debtor.balance), creditor.balance);
    recommendations.push({
      from: debtor.name,
      to: creditor.name,
      amount: Math.round(amount * 100) / 100
    });

    debtor.balance += amount;
    creditor.balance -= amount;
  }

  console.log('Generated Settlements:', recommendations);
  if (recommendations.length === 2 && recommendations[0].amount === 300 && recommendations[1].amount === 200) {
    console.log('✔ Cash Flow Minimizer algorithm test passed');
  } else {
    console.error('❌ Cash Flow Minimizer algorithm test failed');
  }
}

testParser();
testDateParser();
testSplitParser();
testCashFlowMinimizer();
