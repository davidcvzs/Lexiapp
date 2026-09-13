import { BaseService } from './BaseService';
import { signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import { auth, googleProvider } from '../config/firebase';

export class AuthService extends BaseService {
  private user: User | null = null;
  private authStateListener: ((user: User | null) => void) | null = null;

  constructor() {
    super();
    // Iniciar escucha del estado persistente
    onAuthStateChanged(auth, (firebaseUser) => {
      this.user = firebaseUser;
      if (this.authStateListener) {
        this.authStateListener(firebaseUser);
      }
    });
  }

  /**
   * Suscribirse a cambios en el estado de autenticación (Login/Logout)
   */
  public onAuthStateChange(listener: (user: User | null) => void) {
    this.authStateListener = listener;
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
