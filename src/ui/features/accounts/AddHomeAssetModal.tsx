import {
  Button,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
} from "@heroui/react";
import { HomeIcon } from "lucide-react";
import { useState, useTransition } from "react";

export function AddHomeAssetModal({
  isOpen,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (input: { name: string; value: number }) => Promise<void>;
}) {
  const [name, setName] = useState("Home");
  const [value, setValue] = useState("");
  const [isSaving, startSaving] = useTransition();

  const handleOpenChange = (open: boolean) => {
    if (!open && !isSaving) {
      setName("Home");
      setValue("");
      onClose();
    }
  };

  const handleSave = () => {
    if (isSaving) return;
    startSaving(async () => {
      await onSave({
        name: name.trim() || "Home",
        value: Math.max(0, Number(value) || 0),
      });
      setName("Home");
      setValue("");
      onClose();
    });
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={handleOpenChange}>
      <ModalBackdrop variant="opaque" className="bg-black/55">
        <ModalContainer placement="center" className="px-4">
          <ModalDialog className="w-full max-w-md overflow-hidden rounded-2xl border border-divider bg-content1 p-0 text-foreground shadow-2xl">
            <ModalHeader className="border-b border-divider px-6 py-5">
              <ModalHeading className="flex items-center gap-2 text-lg font-bold">
                <HomeIcon size={18} />
                Add home value
              </ModalHeading>
            </ModalHeader>
            <ModalBody className="flex flex-col gap-4 px-6 py-5">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Home"
                  className="rounded-xl border border-divider bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Estimated value</span>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder="450000"
                  className="rounded-xl border border-divider bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <span className="text-xs text-default-400">
                  Manual estimate for now. Zillow refresh can come later.
                </span>
              </label>
            </ModalBody>
            <ModalFooter className="flex justify-end gap-3 border-t border-divider px-6 py-4">
              <Button
                onPress={() => handleOpenChange(false)}
                isDisabled={isSaving}
                className="rounded-lg bg-default-100"
              >
                Cancel
              </Button>
              <Button variant="primary" onPress={handleSave} isDisabled={isSaving} className="rounded-lg">
                {isSaving ? "Saving..." : "Add home"}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
