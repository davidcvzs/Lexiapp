import { BaseService } from './BaseService';
import { signInWithPopup, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import { auth, googleProvider } from '../config/firebase';

export class AuthService extends BaseService {
  private user: User | null = null;

  constructor() {
    super();
    // Iniciar escucha del estado persistente
    onAuthStateChanged(auth, (firebaseUser) => {
      this.user = firebaseUser;
    });
  }

  public onAuthStateChange(listener: (user: User | null) => void) {
    return onAuthStateChanged(auth, (user) => {
      this.user = user;
      listener(user);
    });
  }

  public async loginWithEmail(email: string, password: string): Promise<boolean> {
    try {
      this.log('Iniciando flujo de autenticación con Email');
      const result = await signInWithEmailAndPassword(auth, email, password);
      this.user = result.user;
      this.log('Autenticación exitosa', this.user.email);
      return true;
    } catch (e) {
      this.handleError(e);
      alert("Error de inicio de sesión. Verifica tus credenciales.");
      return false;
    }
  }

  /**
   * Iniciar sesión con Google disparando el Pop-Up
   */
  public async loginWithGoogle(): Promise<boolean> {
    try {
      this.log('Iniciando flujo de autenticación con Google Popup');
      const result = await signInWithPopup(auth, googleProvider);
      this.user = result.user;
      this.log('Autenticación exitosa', this.user.email);
      return true;
    } catch (e) {
      this.handleError(e);
      // alert() for now to handle firebase mock misconfigurations visually on the web
      alert("Error de Firebase Auth. Verifica que las credenciales estén conectadas.");
      return false;
    }
  }

  /**
   * Cierra la sesión activa
   */
  public async logout(): Promise<void> {
    try {
      await signOut(auth);
      this.user = null;
      this.log('Sesión cerrada');
    } catch (e) {
      this.handleError(e);
    }
  }

  /**
   * Devuelve el usuario actual logueado o null
   */
  public getCurrentUser(): User | null {
    return this.user;
  }
}
