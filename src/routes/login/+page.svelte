<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
</script>

<svelte:head><title>Logga in</title></svelte:head>

<main>
	<form method="POST" use:enhance={() => ({ update }) => update({ reset: true })}>
		<label for="password">Lösenord</label>
		<input id="password" name="password" type="password" autocomplete="current-password" required />
		{#if form?.error}<p role="alert">{form.error}</p>{/if}
		<button>Logga in</button>
	</form>
</main>

<style>
	main {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		font-family: system-ui, sans-serif;
	}
	form {
		display: grid;
		gap: 0.75rem;
		width: min(20rem, 90vw);
	}
	input,
	button {
		font: inherit;
		padding: 0.6rem 0.75rem;
	}
	p {
		margin: 0;
		color: #b3261e;
	}
</style>
