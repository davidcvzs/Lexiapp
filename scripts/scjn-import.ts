import fs from 'fs';
import path from 'path';
import { SQLiteSCJNRepository } from '../server/scjn/SQLiteSCJNRepository.js';
import { SCJNImportService } from '../server/scjn/SCJNImportService.js';

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error("Uso: npm run scjn:import -- <archivo.zip|archivo.csv>");
    process.exit(1);
  }

  const absolutePath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Archivo no encontrado: ${absolutePath}`);
    process.exit(1);
  }

  const repo = new SQLiteSCJNRepository();
  await repo.init();
  const service = new SCJNImportService(repo);

  console.log(`Iniciando importación desde: ${absolutePath}`);

  try {
    let result;
    if (absolutePath.toLowerCase().endsWith('.zip')) {
      result = await service.processZipFile(absolutePath, path.basename(absolutePath));
    } else if (absolutePath.toLowerCase().endsWith('.csv')) {
      result = await service.processCsvFile(absolutePath, path.basename(absolutePath));
    } else {
      console.error("Formato no soportado. Debe ser .zip o .csv");
      process.exit(1);
    }

    console.log("=========================================");
    console.log("RESULTADO DE LA IMPORTACIÓN");
    console.log("=========================================");
    console.log(`Filas analizadas: ${result.rowCount}`);
    console.log(`Insertados:       ${result.insertedCount}`);
    console.log(`Actualizados:     ${result.updatedCount}`);
    console.log(`Omitidos:         ${result.skippedCount}`);
    console.log(`SHA-256 (CSV):    ${result.csvSha256}`);
    console.log(`Acuse Oficial:    ${result.acuseFilename || 'No encontrado'}`);
    console.log("=========================================");
    
    process.exit(0);
  } catch (err: any) {
    console.error("Error durante la importación:", err.message);
    process.exit(1);
  }
}

main();
