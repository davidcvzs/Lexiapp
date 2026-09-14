import { SQLiteSCJNRepository } from './server/scjn/SQLiteSCJNRepository.js';

async function test() {
  const repo = new SQLiteSCJNRepository();
  await repo.init();
  
  console.log('--- Catalogs ---');
  const cats = await repo.getCatalogs();
  console.log('Epocas:', cats.epocas.map(e => e.id).join(', '));
  console.log('Materias:', cats.materias.map(e => e.id).join(', '));
  console.log('Tipos:', cats.tipos.map(e => e.id).join(', '));

  console.log('\n--- Search exact (2031233) ---');
  let s = await repo.search({ registro: '2031233' });
  console.log('Total:', s.total, 'Rubro:', s.data[0]?.rubro?.substring(0, 50));

  console.log('\n--- Search word in rubro (INTERÉS) ---');
  s = await repo.search({ q: 'INTERÉS' });
  console.log('Total:', s.total, 'First Rubro:', s.data[0]?.rubro?.substring(0, 50));

  console.log('\n--- Combined filters (Penal, Undécima Época, Jurisprudencia) ---');
  s = await repo.search({ materia: 'Penal', epoca: 'Undécima', tipo: 'Juris' });
  console.log('Total:', s.total, 'First Rubro:', s.data[0]?.rubro?.substring(0, 50));

  console.log('\n--- Detail (2030607) ---');
  const det = await repo.getByRegistroDigital('2030607');
  console.log(det?.registroDigital, det?.tesis, det?.instancia);
}
test().catch(console.error);
