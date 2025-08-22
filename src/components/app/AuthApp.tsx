// src/components/app/AuthApp.tsx
import type React from "react";
import { useState } from "react";

import texlyeLogo from "../../assets/images/TeXlyre_notext.png";
import texlyreLogo from "../../assets/images/TeXlyre_notext.png";
import { useTheme } from "../../hooks/useTheme";
import ImportAccount from "../auth/ImportAccount";
import Login from "../auth/Login";
import Register from "../auth/Register";
import PrivacyModal from "../common/PrivacyModal";

interface AuthContainerProps {
	onAuthSuccess: () => void;
}

const AuthApp: React.FC<AuthContainerProps> = ({ onAuthSuccess }) => {
	const { currentThemePlugin, currentVariant } = useTheme();
	const [activeView, setActiveView] = useState<"login" | "register" | "import">(
		"login",
	);
	const [showPrivacy, setShowPrivacy] = useState(false);

	const switchToLogin = () => {
		setActiveView("login");
	};

	const switchToRegister = () => {
		setActiveView("register");
	};

	const switchToImport = () => {
		setActiveView("import");
	};

	return (
	   <div className={`auth-container ${currentThemePlugin?.id || "default"}`}>
		  <div className="auth-box">
			 <div className="auth-header">
				<div className="auth-logo-wrapper">
				   <img src={texlyeLogo} className="auth-logo" alt="TeXlyre logo" />
				</div>
				<h1>TeXlyre</h1>
			 </div>

			 {activeView === "login" ? (
				<Login
				   onLoginSuccess={onAuthSuccess}
				   onSwitchToRegister={switchToRegister}
				   onSwitchToImport={switchToImport}
				/>
			 ) : activeView === "register" ? (
				<Register
				   onRegisterSuccess={onAuthSuccess}
				   onSwitchToLogin={switchToLogin}
				   onShowPrivacy={() => setShowPrivacy(true)}
				/>
			 ) : (
				<ImportAccount
				   onImportSuccess={onAuthSuccess}
				   onSwitchToLogin={switchToLogin}
				/>
			 )}

			 <div className="auth-privacy-note">
				<p>Your account and projects stay private in this browser. TeXlyre is fully local.</p>
			 </div>
		  </div>
		  <footer className="auth-footer">
			 <p className="read-the-docs">
				Built with TeXlyre
				<a href="https://texlyre.github.io" target="_blank" rel="noreferrer">
				   <img src={texlyreLogo} className="logo" alt="TeXlyre logo" />
				</a>
				 <span className="legal-links">
				  <br/> <a href="https://texlyre.github.io/docs/intro" target="_blank" rel="noreferrer">
					Documentation
				  </a>
					{" "} • <a href="https://github.com/TeXlyre/texlyre" target="_blank" rel="noreferrer">
					Source Code
				  </a>
				  {" "} • <a href="javascript:void(0)" onClick={() => setShowPrivacy(true)} className="privacy-link">
					Privacy
				  </a>
				</span>
			 </p>
		  </footer>

		   <PrivacyModal
			   isOpen={showPrivacy}
			   onClose={() => setShowPrivacy(false)}
		   />

	   </div>
	);

};

export default AuthApp;