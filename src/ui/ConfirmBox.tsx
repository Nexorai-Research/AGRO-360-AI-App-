import { Text, View } from 'react-native';
import { Button } from './Button';
import { Notice, kit } from './kit';

/**
 * The phone's version of the web's "Are you sure?" dialog (`confirmDialog`): the question and what will happen, then the confirming
 * button and Cancel. Nothing is sent until the confirming button is pressed.
 */
export function ConfirmBox({
  title,
  text,
  confirm,
  cancel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  text: string;
  confirm: string;
  cancel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <Text style={kit.name} accessibilityRole="header">
        {title}
      </Text>
      <Notice tone="warn" text={text} />
      <View style={kit.row}>
        <Button label={confirm} disabled={busy} onPress={onConfirm} />
        <Button kind="ghost" label={cancel} onPress={onCancel} />
      </View>
    </>
  );
}
