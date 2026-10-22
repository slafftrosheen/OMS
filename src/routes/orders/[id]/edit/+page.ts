import type { PageLoad } from './$types';

// Helper type for our return data
interface EditPageData {
    id: string;
    order: any;
    files: any[];
    profilePresets: any[];
    session: any;
}

export const load: PageLoad = async ({ params, fetch }): Promise<EditPageData> => {
    const id = params.id;
    
    try {
        const orderRes = await fetch(`/api/draft-orders/${id}`);
        let order: any = null;
        if (orderRes.ok) {
            order = await orderRes.json();
        } else {
            order = null;
        }
        
        // Attachment data is fetched on demand by OrderFiles and AI selectors.
        // Avoid preloading only the first 50 links in page data.
        const files: any[] = [];

        // Fetch profile presets for loading saved profiles
        const presetsRes = await fetch('/api/order-profile-presets');
        let profilePresets: any[] = [];
        if (presetsRes.ok) {
            profilePresets = await presetsRes.json();
        }
        
        // Return data matching the component's expectations
        // The edit page expects: data.id, data.order, data.files, data.session
        return {
            id,
            order,
            files,
            profilePresets,
            // Authentication is supplied by the request-scoped API and the
            // auth store; universal loaders have no server-side locals.
            session: null
        };
    } catch (error) {
        console.error('Failed to load order data:', error);
        return {
            id,
            order: null,
            files: [],
            profilePresets: [],
            session: null
        };
    }
};
