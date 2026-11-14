import { defineAction } from 'astro:actions';
import { handleContact } from '../lib/form-guard';

export const server = {
  // Form-encoded so a plain <form method="post"> works without JavaScript. The guard checks
  // the fields against the CMS form itself, so there is no static input schema here.
  contact: defineAction({
    accept: 'form',
    handler: (formData, context) => handleContact(formData, { clientAddress: context.clientAddress }),
  }),
};
