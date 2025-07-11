import type React from "react";
import texlyreLogo from "../../assets/images/TeXlyre_notext.png";

interface SplashScreenProps {
  isVisible: boolean;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ isVisible }) => {
  if (!isVisible) return null;

  return (
    <div className="splash-screen">
      <div className="splash-content">
        <div className="splash-logo">
          <img src={texlyreLogo} alt="TeXlyre" />
        </div>
        <h1 className="splash-title">TeXlyre</h1>
        <div className="splash-loading">
          <div className="loading-spinner" />
          <p>Loading TeXlyre...</p>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;