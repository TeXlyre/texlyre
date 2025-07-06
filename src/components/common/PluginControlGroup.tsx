import type React from "react";

interface PluginControlGroupProps {
	children: React.ReactNode;
	className?: string;
}

export const PluginControlGroup: React.FC<PluginControlGroupProps> = ({
	children,
	className = "",
}) => {
	return <div className={`control-group ${className}`}>{children}</div>;
};
