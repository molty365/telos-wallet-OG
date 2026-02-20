import { EthereumProvider } from 'src/antelope/types';
import { EVMAuthenticator, InjectedProviderAuth } from 'src/antelope/wallets';

const name = 'Rabby';
export const RabbyAuthName = name;
export class RabbyAuth extends InjectedProviderAuth {

    // this is just a dummy label to identify the authenticator base class
    constructor(label = name) {
        super(label);
    }

    // InjectedProviderAuth API ------------------------------------------------------

    getProvider(): EthereumProvider | null {
        const eth = window.ethereum as unknown as EthereumProvider & { isRabby?: boolean };
        // Rabby injects window.ethereum with isRabby flag
        if (eth && eth.isRabby) {
            return eth;
        }
        return null;
    }

    // EVMAuthenticator API ----------------------------------------------------------

    getName(): string {
        return name;
    }

    // this is the important instance creation where we define a label to assign to this instance of the authenticator
    newInstance(label: string): EVMAuthenticator {
        this.trace('newInstance', label);
        return new RabbyAuth(label);
    }

}
