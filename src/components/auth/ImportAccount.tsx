// src/components/auth/ImportAccount.tsx
import type React from "react";
import { useState } from "react";

import { accountExportService } from "../../services/AccountExportService";

interface ImportAccountProps {
	onImportSuccess: () => void;
	onSwitchToLogin: () => void;
}

const ImportAccount: React.FC<ImportAccountProps> = ({
	onImportSuccess,
	onSwitchToLogin,
}) => {
	const [file, setFile] = useState<File | null>(null);
	const [isImporting, setIsImporting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files?.[0]) {
			setFile(e.target.files[0]);
			setError(null);
		}
	};

	const handleImport = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!file) {
			setError("Please select a file to import");
			return;
		}

		if (!file.name.endsWith(".zip")) {
			setError("Please select a valid TeXlyre export file (.zip)");
			return;
		}

		setIsImporting(true);
		setError(null);

		try {
			await accountExportService.importAccount(file);
			onImportSuccess();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Error importing account");
		} finally {
			setIsImporting(false);
		}
	};

	return (
		<div className="import-account-container">
			<h3>Import Account</h3>

			{error && <div className="error-message">{error}</div>}

			<form onSubmit={handleImport}>
				<div className="form-group">
					<label htmlFor="importFile">Select account export file (.zip)</label>
					<input
						type="file"
						id="importFile"
						accept=".zip"
						onChange={handleFileChange}
						disabled={isImporting}
					/>
				</div>

				<button
					type="submit"
					className="auth-button"
					disabled={!file || isImporting}
				>
					{isImporting ? "Importing..." : "Import Account"}
				</button>
			</form>

			<div className="auth-alt-action">
				<span>Back to login?</span>
				<button
					className="text-button"
					onClick={onSwitchToLogin}
					disabled={isImporting}
				>
					Login
				</button>
			</div>
		</div>
	);
};

export default ImportAccount;
