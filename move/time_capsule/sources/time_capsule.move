module time_capsule::time_capsule {
    use std::signer;
    use std::vector;
    use std::string::{Self, String};
    use aptos_framework::timestamp;

    struct Capsule has store, drop, copy {
        id: u64,
        sender: address,
        receiver: address,
        unlock_time: u64,
        encrypted_hex: String, // Stores encrypted JSON containing both text and file data
        content_type: String,  // "text", "file", or "mixed" - to help frontend handle display
    }

    struct Capsules has key {
        items: vector<Capsule>,
        next_id: u64,
    }

    public entry fun init_storage(admin: &signer) {
        assert!(signer::address_of(admin) == @time_capsule, 1);
        move_to(admin, Capsules { 
            items: vector::empty<Capsule>(), 
            next_id: 0 
        });
    }

    public entry fun create_capsule(
        sender: &signer,
        receiver: address,
        unlock_time: u64,
        encrypted: vector<u8>, // Still accept bytes from frontend
        content_type: String,  // New parameter to specify content type
    ) acquires Capsules {
        assert!(exists<Capsules>(@time_capsule), 2);
        let now = timestamp::now_seconds();
        assert!(unlock_time > now, 3);

        let store = borrow_global_mut<Capsules>(@time_capsule);
        let id = store.next_id;
        store.next_id = id + 1;

        // Convert bytes to hex string for storage
        let hex_string = bytes_to_hex_string(encrypted);

        vector::push_back(&mut store.items, Capsule {
            id,
            sender: signer::address_of(sender),
            receiver,
            unlock_time,
            encrypted_hex: hex_string,
            content_type,
        });
    }

    #[view]
    public fun get_capsules_len(): u64 acquires Capsules {
        let store = borrow_global<Capsules>(@time_capsule);
        vector::length(&store.items)
    }

    #[view]
    public fun capsule_meta(id: u64): (address, address, u64, String) acquires Capsules {
        let store = borrow_global<Capsules>(@time_capsule);
        (store.items[id].sender, store.items[id].receiver, store.items[id].unlock_time, store.items[id].content_type)
    }

    #[view]
    public fun reveal_encrypted(caller: address, id: u64): String acquires Capsules {
        let store = borrow_global<Capsules>(@time_capsule);
        let cap = vector::borrow(&store.items, id);
        if (timestamp::now_seconds() >= cap.unlock_time && 
            (caller == cap.receiver || caller == cap.sender)) {
            cap.encrypted_hex // Return hex string directly
        } else {
            string::utf8(b"") // Return empty string if conditions fail
        }
    }

    // Helper function to convert bytes to hex string
    fun bytes_to_hex_string(bytes: vector<u8>): String {
        let hex_chars = b"0123456789abcdef";
        let result = vector::empty<u8>();
        
        let i = 0;
        let len = vector::length(&bytes);
        while (i < len) {
            let byte = *vector::borrow(&bytes, i);
            let high = byte / 16;
            let low = byte % 16;
            
            vector::push_back(&mut result, *vector::borrow(&hex_chars, (high as u64)));
            vector::push_back(&mut result, *vector::borrow(&hex_chars, (low as u64)));
            
            i = i + 1;
        };
        
        string::utf8(result)
    }

    // Optional: Helper function to get raw bytes if needed
    #[view]
    public fun reveal_encrypted_bytes(caller: address, id: u64): vector<u8> acquires Capsules {
        let store = borrow_global<Capsules>(@time_capsule);
        let cap = vector::borrow(&store.items, id);
        if (timestamp::now_seconds() >= cap.unlock_time && 
            (caller == cap.receiver || caller == cap.sender)) {
            hex_string_to_bytes(cap.encrypted_hex)
        } else {
            vector::empty<u8>() // Return empty bytes if conditions fail
        }
    }

    // Helper function to convert hex string back to bytes
    fun hex_string_to_bytes(hex_str: String): vector<u8> {
        let hex_bytes = string::bytes(&hex_str);
        let result = vector::empty<u8>();
        
        let i = 0;
        let len = vector::length(hex_bytes);
        while (i < len) {
            let high_char = *vector::borrow(hex_bytes, i);
            let low_char = *vector::borrow(hex_bytes, i + 1);
            
            let high_val = hex_char_to_value(high_char);
            let low_val = hex_char_to_value(low_char);
            
            let byte_val = high_val * 16 + low_val;
            vector::push_back(&mut result, (byte_val as u8));
            
            i = i + 2;
        };
        
        result
    }

    // Helper function to convert hex character to numeric value
    fun hex_char_to_value(c: u8): u8 {
        if (c >= 48 && c <= 57) { // '0' to '9'
            c - 48
        } else if (c >= 97 && c <= 102) { // 'a' to f'
            c - 97 + 10
        } else if (c >= 65 && c <= 70) { // 'A' to 'F'
            c - 65 + 10
        } else {
            0 // Invalid hex character, return 0
        }
    }
}