/** Run one pre-scoring batch from the command line (the nightly job does the same). */
import { prescoreBatch } from "../src/jobs/prescore.ts";
import { prisma } from "../src/db.ts";

const r = await prescoreBatch((m) => console.log(m));
console.log(r);
await prisma.$disconnect();
process.exit(0);
