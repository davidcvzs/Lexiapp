import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where,
  serverTimestamp
} from "firebase/firestore";
import { db } from "../config/firebase";
import { BaseService } from "./BaseService";

export interface CaseFile {
  id?: string;
  userId: string;
  caseNumber: string;
  type: string;
  status: 'PROCESANDO' | 'COMPLETADO';
  createdAt: any;
  updatedAt: any;
  contentRef?: string;
}

/**
 * Servicio encargado de gestionar todos los objetos orientados a bases de datos (Firestore)
 */
export class DatabaseService extends BaseService {
  private casesCollection = collection(db, "cases");

  constructor() {
    super();
  }

  /**
   * Crea un nuevo registro de expediente o caso
   */
  public async createCase(data: Omit<CaseFile, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    this.log("Creando nuevo expediente en la BD", data);
    try {
      const docRef = await addDoc(this.casesCollection, {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return docRef.id;
    } catch (e) {
      this.handleError(e);
      throw e;
    }
  }

  /**
   * Recupera los expedientes pertenecientes al usuario actual
   */
  public async getUserCases(userId: string): Promise<CaseFile[]> {
    this.log("Recuperando expedientes del usuario: " + userId);
    try {
      const q = query(this.casesCollection, where("userId", "==", userId));
      const querySnapshot = await getDocs(q);
      const results: CaseFile[] = [];
      querySnapshot.forEach((docSnap) => {
        results.push({ id: docSnap.id, ...docSnap.data() } as CaseFile);
      });
      return results;
    } catch (e) {
      this.handleError(e);
      throw e;
    }
  }
}
