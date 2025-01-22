import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';

interface OwnerValueEditorProps {
  initialValue: number | null;
  onSave: (value: number | null) => Promise<void>;
  onCancel: () => void;
}

const OwnerValueEditor: React.FC<OwnerValueEditorProps> = ({
  initialValue,
  onSave,
  onCancel,
}) => {
  const [value, setValue] = useState(initialValue?.toString() ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      const numValue = value === '' ? null : parseFloat(value);
      await onSave(numValue);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-1 w-full">
      <Input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-20 text-right"
        step="any"
        disabled={isSubmitting}
      />
      <div className="flex gap-1 shrink-0">
        <Button
          size="icon"
          variant="ghost"
          onClick={handleSave}
          disabled={isSubmitting}
          className="h-7 w-7"
        >
          <Check className="h-3 w-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onCancel}
          disabled={isSubmitting}
          className="h-7 w-7"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};

export default OwnerValueEditor;