// src/components/profile/ExportAccountModal.tsx
import type React from "react";
import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { accountExportService } from "../../services/AccountExportService";
import Modal from "../common/Modal";

interface ExportAccountModalProps {
	isOpen: boolean;
	onClose: () => void;
}

const ExportAccountModal: React.FC<ExportAccountModalProps> = ({
	isOpen,
	onClose,
}) => {
	const { user } = useAuth();
	const [exportOption, setExportOption] = useState<"current" | "all">(
		"current",
	);
	const [isExporting, setIsExporting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleExport = async () => {
		if (!user) return;

		setIsExporting(true);
		setError(null);

		try {
			await accountExportService.exportAccount(user.id, exportOption === "all");
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Error exporting account");
		} finally {
			setIsExporting(false);
		}
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title="Export Account"
			size="medium"
		>
			<div className="export-account-container">
				{error && <div className="error-message">{error}</div>}

				<p>
					Export your account data as a zip file. This will include your account
					information and selected projects with all associated documents and
					files.
				</p>

				<div className="export-options">
					<h3>What to export</h3>

					<div className="option-group">
						<label>
							<input
								type="radio"
								name="exportOption"
								value="current"
								checked={exportOption === "current"}
								onChange={() => setExportOption("current")}
								disabled={isExporting}
							/>
							<span>Current project only</span>
						</label>

						<label>
							<input
								type="radio"
								name="exportOption"
								value="all"
								checked={exportOption === "all"}
								onChange={() => setExportOption("all")}
								disabled={isExporting}
							/>
							<span>All projects</span>
						</label>
					</div>
				</div>

				<div className="modal-actions">
					<button
						type="button"
						className="button secondary"
						onClick={onClose}
						disabled={isExporting}
					>
						Cancel
					</button>
					<button
						type="button"
						className="button primary"
						onClick={handleExport}
						disabled={isExporting}
					>
						{isExporting ? "Exporting..." : "Export Account"}
					</button>
				</div>
			</div>
		</Modal>
	);
};

export default ExportAccountModal;
