// Run the real native document controls in the browser, with no native or live IO.
export * from 'react-native-web';
export const Platform = {
  OS: 'ios',
  select: (options) => options.ios ?? options.default,
};

// Render the native confirmation as an accessible browser dialog. Invoke only
// the option selected by the test, exactly as Alert.alert does on the device.
export const Alert = {
  alert(title, message, buttons = []) {
    const dialog = document.createElement('dialog');
    const heading = document.createElement('h2');
    heading.textContent = title;
    dialog.append(heading, document.createTextNode(message));
    for (const action of buttons) {
      const button = document.createElement('button');
      button.textContent = action.text;
      button.onclick = () => { dialog.close(); dialog.remove(); action.onPress?.(); };
      dialog.append(button);
    }
    document.body.append(dialog);
    dialog.showModal();
  },
};
