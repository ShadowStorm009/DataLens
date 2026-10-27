import React from 'react';
import CleaningWizard from './CleaningWizard';

/**
 * DataLens Cleaning & Transformation Panel.
 * Wraps the guided, step-by-step CleaningWizard for dataset quality refinement.
 */
export default function CleaningPanel(props) {
  return <CleaningWizard {...props} />;
}
