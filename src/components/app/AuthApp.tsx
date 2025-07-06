// src/components/app/AuthApp.tsx
import type React from "react";
import { useState } from "react";

import texlyeLogo from "../../assets/images/TeXlyre_notext.png";
import texlyreLogo from "../../assets/images/TeXlyre_notext.png";
import { useTheme } from "../../hooks/useTheme.ts";
import ImportAccount from "../auth/ImportAccount.tsx";
import Login from "../auth/Login.tsx";
import Register from "../auth/Register.tsx";

interface AuthContainerProps {
	onAuthSuccess: () => void;
}

const AuthApp: React.FC<AuthContainerProps> = ({ onAuthSuccess }) => {
	const { currentThemePlugin, currentVariant } = useTheme();
	const [activeView, setActiveView] = useState<"login" | "register" | "import">(
		"login",
	);

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
					/>
				) : (
					<ImportAccount
						onImportSuccess={onAuthSuccess}
						onSwitchToLogin={switchToLogin}
					/>
				)}
			</div>

			<div className="auth-footer">
				<p className="read-the-docs">
					Built with TeXlyre
					<a href="https://texlyre.github.io" target="_blank" rel="noreferrer">
						<img src={texlyreLogo} className="logo" alt="TeXlyre logo" />
					</a>
				</p>
			</div>
		</div>
	);
};

export default AuthApp;
