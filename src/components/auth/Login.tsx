// src/components/auth/Login.tsx
import type React from "react";
import { useState } from "react";

import { useAuth } from "../../hooks/useAuth";
import { useTheme } from "../../hooks/useTheme";

interface LoginProps {
	onLoginSuccess: () => void;
	onSwitchToRegister: () => void;
	onSwitchToImport: () => void;
}

const Login: React.FC<LoginProps> = ({
	onLoginSuccess,
	onSwitchToRegister,
	onSwitchToImport,
}) => {
	const { login } = useAuth();
	const { currentThemePlugin } = useTheme();

	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!username || !password) {
			setError("Please enter both username and password");
			return;
		}

		setError(null);
		setIsLoading(true);

		try {
			await login(username, password);
			onLoginSuccess();
			window.location.reload();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "An error occurred during login",
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="auth-form-container">
			<h2>Login</h2>

			{error && <div className="auth-error">{error}</div>}

			<form onSubmit={handleSubmit} className="auth-form">
				<div className="form-group">
					<label htmlFor="username">Username</label>
					<input
						type="text"
						id="username"
						value={username}
						onChange={(e) => setUsername(e.target.value)}
						disabled={isLoading}
						autoComplete="username"
					/>
				</div>

				<div className="form-group">
					<label htmlFor="password">Password</label>
					<input
						type="password"
						id="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						disabled={isLoading}
						autoComplete="current-password"
					/>
				</div>

				<button
					type="submit"
					className={`auth-button ${isLoading ? "loading" : ""}`}
					disabled={isLoading}
				>
					{isLoading ? "Logging in..." : "Login"}
				</button>
			</form>

			<div className="auth-alt-action">
				<span>Don't have an account?</span>
				<button
					className="text-button"
					onClick={onSwitchToRegister}
					disabled={isLoading}
				>
					Sign up
				</button>
				<span className="auth-separator">or</span>
				<button
					className="text-button"
					onClick={onSwitchToImport}
					disabled={isLoading}
				>
					Import Account
				</button>
			</div>
		</div>
	);
};

export default Login;
